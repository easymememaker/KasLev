// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

interface IKasLevVault {
    function depositMargin(address trader) external payable;
    function settlePayout(address to, uint256 amount) external;
    function totalLiquidity() external view returns (uint256);
}

interface IKasLevAssetRegistry {
    function isTradeable(bytes32 id) external view returns (bool);
    function maxLeverageOf(bytes32 id) external view returns (uint256);
}

/**
 * @title KasLevPerps
 * @notice Native-KAS leveraged perpetuals engine for the Kaspa L2 ecosystem.
 *
 * @dev TRANSPARENCY GUARANTEES (every rule below is enforced in code, nothing is hidden):
 *
 *   FEES  — The ONLY value the developer ever earns. Charged transparently on open and on
 *           close (including liquidation), both computed from the position MARGIN using the
 *           publicly-viewable tier schedule in {getFeeBps}:
 *              • leverage ≤ stdMaxLeverage (50×)            → stdFeeBps    (1.00%)
 *              • stdMaxLeverage < lev < floorLeverage       → highRiskFeeBps(5.00%)
 *              • floorLeverage ≤ lev < megaLeverage         → floorFeeBps  (1.00%)
 *              • megaLeverage ≤ lev < hyperLeverage         → megaFeeBps   (2.00%)
 *              • lev ≥ hyperLeverage                        → hyperFeeBps  (5.00%)
 *           This mirrors the app's src/utils/math.ts exactly. Thresholds and rates are
 *           configurable protocol parameters, but every tier is hard-capped at MAX_FEE_BPS
 *           (10%) and every change emits an event — the owner can never set a predatory or
 *           hidden fee. Fees are paid straight to `devFeeWallet` and never touch the pool.
 *
 *   FUNDS — This engine never custodies liquidity. Margin is escrowed in {KasLevVault};
 *           payouts are settled by the vault. There is no owner withdrawal path here.
 *
 *   PAUSE — {pause} can only stop the OPENING of new positions. Traders can ALWAYS close
 *           or be liquidated, so funds can never be trapped by an admin.
 *
 *   PnL   — Denominated in KAS and derived purely from the traded asset's price ratio:
 *              pnl = ±margin · leverage · (currentPrice − entryPrice) / entryPrice
 *           (matches calculatePnL in src/utils/math.ts). No KAS/USD oracle is required.
 */
contract KasLevPerps is Ownable, Pausable, ReentrancyGuard {
    using Address for address payable;

    // ----------------------------- Constants -----------------------------

    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Absolute ceiling on any fee tier (10%). A transparency guard against abuse.
    uint256 public constant MAX_FEE_BPS = 1_000;
    /// @notice Hard cap on the flat keeper fee (5 KAS). Anti-abuse transparency guard.
    uint256 public constant MAX_KEEPER_FEE = 5e18;
    /// @notice Precision used for USD prices and internal ratio math.
    uint256 private constant PRICE_SCALE = 1e18;

    // ----------------------------- Wiring ---------------------------------

    IKasLevVault public immutable vault;
    IKasLevAssetRegistry public immutable registry;
    IPriceOracle public oracle;

    /// @notice Wallet that receives all developer trading fees. Configurable, event-logged.
    address public devFeeWallet;

    /// @notice Wallet that funds ongoing keeper work (oracle price updates + liquidations).
    address public keeperWallet;

    /// @notice Flat KAS fee (wei) charged on every position open, routed to `keeperWallet`.
    /// @dev Makes the protocol self-sustaining for keeper gas ("the extra ~1x gas each user
    ///      pays keeps the oracle alive"). Transparent: publicly readable, capped by
    ///      MAX_KEEPER_FEE, and every change emits {KeeperConfigUpdated}. Distinct from the
    ///      developer trading fee — it is not developer profit, it is operational funding.
    uint256 public keeperFee;

    // --------------------------- Risk parameters --------------------------

    /// @notice Maintenance margin buffer in bps (0.1% => 10). Liquidation triggers slightly
    ///         before 100% margin loss to protect the pool from bad debt.
    uint256 public maintenanceMarginBps = 10;

    /// @notice Global hard cap on leverage (per-asset caps in the registry may be lower).
    uint256 public maxLeverage = 1_000_000;

    /// @notice Minimum / maximum margin accepted per position (wei of KAS).
    uint256 public minMargin = 1e18; // 1 KAS
    uint256 public maxMargin = 1_000_000e18; // 1,000,000 KAS

    /// @notice Maximum age of an oracle price accepted for open/close/liquidation (seconds).
    uint256 public maxPriceAge = 300;

    // ---------------------------- Fee schedule ----------------------------

    // Tier thresholds (leverage boundaries). Defaults mirror src/utils/math.ts.
    uint256 public stdMaxLeverage = 50;
    uint256 public floorLeverage = 10_000;
    uint256 public megaLeverage = 100_000;
    uint256 public hyperLeverage = 1_000_000;

    // Tier rates in bps.
    uint16 public stdFeeBps = 100; // 1%
    uint16 public highRiskFeeBps = 500; // 5%
    uint16 public floorFeeBps = 100; // 1%
    uint16 public megaFeeBps = 200; // 2%
    uint16 public hyperFeeBps = 500; // 5%

    // ----------------------------- Positions ------------------------------

    struct Position {
        address trader;
        bytes32 assetId;
        bool isLong;
        bool closed;
        uint256 leverage;
        uint256 margin; // KAS wei escrowed in the vault
        uint256 entryPrice; // USD 1e18
        uint16 feeBps; // tier locked at open; reused for the close fee
        uint256 openedAt;
    }

    mapping(uint256 => Position) public positions;
    uint256 public nextPositionId = 1;

    /// @notice All (including closed) position ids opened by a trader, for easy indexing.
    mapping(address => uint256[]) public traderPositions;

    // ------------------------------ Events --------------------------------

    event OracleUpdated(address indexed oracle);
    event DevFeeWalletUpdated(address indexed wallet);
    event KeeperConfigUpdated(address indexed keeperWallet, uint256 keeperFee);
    event RiskParamsUpdated(uint256 maintenanceMarginBps, uint256 maxLeverage, uint256 minMargin, uint256 maxMargin, uint256 maxPriceAge);
    event FeeScheduleUpdated(
        uint256 stdMaxLeverage,
        uint256 floorLeverage,
        uint256 megaLeverage,
        uint256 hyperLeverage,
        uint16 stdFeeBps,
        uint16 highRiskFeeBps,
        uint16 floorFeeBps,
        uint16 megaFeeBps,
        uint16 hyperFeeBps
    );
    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        bytes32 indexed assetId,
        bool isLong,
        uint256 leverage,
        uint256 margin,
        uint256 entryPrice,
        uint256 openFee,
        uint256 liquidationPrice
    );
    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 exitPrice,
        int256 pnl,
        uint256 closeFee,
        uint256 payout,
        bool liquidated
    );

    // ------------------------------ Errors --------------------------------

    error ZeroAddress();
    error NotTradeable();
    error InvalidLeverage();
    error MarginOutOfRange();
    error InsufficientValue();
    error StalePrice();
    error ZeroPrice();
    error NotPositionOwner();
    error AlreadyClosed();
    error NotLiquidatable();
    error FeeTooHigh();
    error KeeperFeeTooHigh();
    error InvalidTierOrder();

    // ---------------------------- Construction ----------------------------

    constructor(
        address initialOwner,
        address vault_,
        address registry_,
        address oracle_,
        address devFeeWallet_
    ) Ownable(initialOwner) {
        if (vault_ == address(0) || registry_ == address(0) || oracle_ == address(0) || devFeeWallet_ == address(0)) {
            revert ZeroAddress();
        }
        vault = IKasLevVault(vault_);
        registry = IKasLevAssetRegistry(registry_);
        oracle = IPriceOracle(oracle_);
        devFeeWallet = devFeeWallet_;
        keeperWallet = devFeeWallet_; // defaults to dev; keeperFee starts at 0 until configured
    }

    // ------------------------- Admin (transparent) ------------------------

    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert ZeroAddress();
        oracle = IPriceOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    function setDevFeeWallet(address wallet) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        devFeeWallet = wallet;
        emit DevFeeWalletUpdated(wallet);
    }

    /**
     * @notice Configure the keeper funding fee and destination wallet.
     * @dev The fee is a flat KAS amount added on top of margin + trading fee at open, sent
     *      to `keeperWallet` to reimburse the gas of oracle updates and liquidations. Capped
     *      at MAX_KEEPER_FEE so it can never become a hidden or predatory charge.
     */
    function setKeeperConfig(address keeperWallet_, uint256 keeperFee_) external onlyOwner {
        if (keeperWallet_ == address(0)) revert ZeroAddress();
        if (keeperFee_ > MAX_KEEPER_FEE) revert KeeperFeeTooHigh();
        keeperWallet = keeperWallet_;
        keeperFee = keeperFee_;
        emit KeeperConfigUpdated(keeperWallet_, keeperFee_);
    }

    function setRiskParams(
        uint256 maintenanceMarginBps_,
        uint256 maxLeverage_,
        uint256 minMargin_,
        uint256 maxMargin_,
        uint256 maxPriceAge_
    ) external onlyOwner {
        if (maxLeverage_ == 0 || minMargin_ == 0 || minMargin_ > maxMargin_) revert MarginOutOfRange();
        maintenanceMarginBps = maintenanceMarginBps_;
        maxLeverage = maxLeverage_;
        minMargin = minMargin_;
        maxMargin = maxMargin_;
        maxPriceAge = maxPriceAge_;
        emit RiskParamsUpdated(maintenanceMarginBps_, maxLeverage_, minMargin_, maxMargin_, maxPriceAge_);
    }

    /**
     * @notice Update the transparent fee schedule. Thresholds must be strictly increasing
     *         and every rate is capped at MAX_FEE_BPS (10%).
     */
    function setFeeSchedule(
        uint256 stdMaxLeverage_,
        uint256 floorLeverage_,
        uint256 megaLeverage_,
        uint256 hyperLeverage_,
        uint16 stdFeeBps_,
        uint16 highRiskFeeBps_,
        uint16 floorFeeBps_,
        uint16 megaFeeBps_,
        uint16 hyperFeeBps_
    ) external onlyOwner {
        if (!(stdMaxLeverage_ < floorLeverage_ && floorLeverage_ < megaLeverage_ && megaLeverage_ < hyperLeverage_)) {
            revert InvalidTierOrder();
        }
        if (
            stdFeeBps_ > MAX_FEE_BPS ||
            highRiskFeeBps_ > MAX_FEE_BPS ||
            floorFeeBps_ > MAX_FEE_BPS ||
            megaFeeBps_ > MAX_FEE_BPS ||
            hyperFeeBps_ > MAX_FEE_BPS
        ) revert FeeTooHigh();

        stdMaxLeverage = stdMaxLeverage_;
        floorLeverage = floorLeverage_;
        megaLeverage = megaLeverage_;
        hyperLeverage = hyperLeverage_;
        stdFeeBps = stdFeeBps_;
        highRiskFeeBps = highRiskFeeBps_;
        floorFeeBps = floorFeeBps_;
        megaFeeBps = megaFeeBps_;
        hyperFeeBps = hyperFeeBps_;

        emit FeeScheduleUpdated(
            stdMaxLeverage_, floorLeverage_, megaLeverage_, hyperLeverage_,
            stdFeeBps_, highRiskFeeBps_, floorFeeBps_, megaFeeBps_, hyperFeeBps_
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------- Fee schedule ----------------------------

    /// @notice Public, deterministic fee (bps) for a given leverage. Mirrors getFeePercentage().
    function getFeeBps(uint256 leverage) public view returns (uint16) {
        if (leverage <= stdMaxLeverage) return stdFeeBps;
        if (leverage < floorLeverage) return highRiskFeeBps;
        if (leverage < megaLeverage) return floorFeeBps;
        if (leverage < hyperLeverage) return megaFeeBps;
        return hyperFeeBps;
    }

    // ------------------------------ Trading -------------------------------

    /**
     * @notice Open a leveraged LONG or SHORT position on a listed market.
     * @param assetId  keccak256(symbol) of a tradeable market.
     * @param leverage Position leverage (1 .. min(maxLeverage, asset cap)).
     * @param isLong   true = LONG, false = SHORT.
     * @param margin   Collateral in KAS (wei). The developer open fee is charged on top,
     *                 so msg.value must be at least `margin + openFee + keeperFee`. Excess is refunded.
     */
    function openPosition(bytes32 assetId, uint256 leverage, bool isLong, uint256 margin)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 positionId)
    {
        if (!registry.isTradeable(assetId)) revert NotTradeable();

        uint256 assetCap = registry.maxLeverageOf(assetId);
        uint256 effectiveCap = assetCap < maxLeverage ? assetCap : maxLeverage;
        if (leverage == 0 || leverage > effectiveCap) revert InvalidLeverage();
        if (margin < minMargin || margin > maxMargin) revert MarginOutOfRange();

        uint16 feeBps = getFeeBps(leverage);
        uint256 openFee = (margin * feeBps) / BPS_DENOMINATOR;
        uint256 kFee = keeperFee;
        uint256 required = margin + openFee + kFee;
        if (msg.value < required) revert InsufficientValue();

        uint256 entryPrice = _freshPrice(assetId);

        positionId = nextPositionId++;
        positions[positionId] = Position({
            trader: msg.sender,
            assetId: assetId,
            isLong: isLong,
            closed: false,
            leverage: leverage,
            margin: margin,
            entryPrice: entryPrice,
            feeBps: feeBps,
            openedAt: block.timestamp
        });
        traderPositions[msg.sender].push(positionId);

        // Interactions (state already written; guarded by nonReentrant):
        // 1) escrow margin in the vault, 2) pay open fee to the dev wallet, 3) refund dust.
        vault.depositMargin{value: margin}(msg.sender);
        if (openFee > 0) payable(devFeeWallet).sendValue(openFee);
        if (kFee > 0) payable(keeperWallet).sendValue(kFee);
        uint256 refund = msg.value - required;
        if (refund > 0) payable(msg.sender).sendValue(refund);

        emit PositionOpened(
            positionId, msg.sender, assetId, isLong, leverage, margin, entryPrice, openFee,
            _liquidationPrice(isLong, entryPrice, leverage)
        );
    }

    /**
     * @notice Close your own position at the current oracle price. Also serves as the
     *         "Emergency Close" action — always available, even while the protocol is paused.
     */
    function closePosition(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.trader != msg.sender) revert NotPositionOwner();
        _settle(positionId, p, false);
    }

    /**
     * @notice Liquidate a position whose loss has reached the maintenance threshold.
     *         Permissionless (any keeper may call) but only when actually liquidatable.
     */
    function liquidate(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.closed || p.trader == address(0)) revert AlreadyClosed();
        uint256 price = _freshPrice(p.assetId);
        if (!_isLiquidatable(p, price)) revert NotLiquidatable();
        _settle(positionId, p, true);
    }

    // --------------------------- Settlement core --------------------------

    function _settle(uint256 positionId, Position storage p, bool liquidated) private {
        if (p.closed) revert AlreadyClosed();
        p.closed = true; // effect before interactions (CEI)

        uint256 exitPrice = _freshPrice(p.assetId);
        int256 pnl = _pnl(p, exitPrice);

        // Equity = margin +/- pnl, floored at zero (loss is capped at the margin).
        uint256 equity;
        if (pnl >= 0) {
            equity = p.margin + uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            equity = loss >= p.margin ? 0 : p.margin - loss;
        }

        // Close fee (developer revenue). Charged even on liquidation, but never more than
        // the remaining equity, so a wiped position can't create negative balances.
        uint256 closeFee = (p.margin * p.feeBps) / BPS_DENOMINATOR;
        if (closeFee > equity) closeFee = equity;
        uint256 payout = equity - closeFee;

        // Interactions via the vault (the only contract able to move liquidity).
        if (closeFee > 0) vault.settlePayout(devFeeWallet, closeFee);
        if (payout > 0) vault.settlePayout(p.trader, payout);

        emit PositionClosed(positionId, p.trader, exitPrice, pnl, closeFee, payout, liquidated);
    }

    // ------------------------------ Views ---------------------------------

    /// @notice Signed PnL (KAS wei) of an open position at the current oracle price.
    function currentPnL(uint256 positionId) external view returns (int256) {
        Position storage p = positions[positionId];
        (uint256 price, ) = oracle.getPrice(p.assetId);
        if (price == 0 || p.entryPrice == 0) return 0;
        return _pnl(p, price);
    }

    /// @notice Liquidation price (USD 1e18) for a position.
    function liquidationPrice(uint256 positionId) external view returns (uint256) {
        Position storage p = positions[positionId];
        return _liquidationPrice(p.isLong, p.entryPrice, p.leverage);
    }

    /// @notice Whether a position can currently be liquidated at the latest oracle price.
    function isLiquidatable(uint256 positionId) external view returns (bool) {
        Position storage p = positions[positionId];
        if (p.closed) return false;
        (uint256 price, ) = oracle.getPrice(p.assetId);
        if (price == 0) return false;
        return _isLiquidatable(p, price);
    }

    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return traderPositions[trader];
    }

    /// @notice Preview the KAS required (margin + open fee + keeper fee) to open a position.
    function quoteOpenCost(uint256 leverage, uint256 margin)
        external
        view
        returns (uint256 openFee, uint256 keeperFee_, uint256 total)
    {
        openFee = (margin * getFeeBps(leverage)) / BPS_DENOMINATOR;
        keeperFee_ = keeperFee;
        total = margin + openFee + keeperFee_;
    }

    // ---------------------------- Internal math ---------------------------

    function _freshPrice(bytes32 assetId) private view returns (uint256) {
        (uint256 price, uint256 updatedAt) = oracle.getPrice(assetId);
        if (price == 0) revert ZeroPrice();
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice();
        return price;
    }

    function _pnl(Position storage p, uint256 currentPrice) private view returns (int256) {
        // pnl = direction * (margin * leverage) * (current - entry) / entry
        int256 delta = int256(currentPrice) - int256(p.entryPrice);
        if (!p.isLong) delta = -delta;
        int256 notional = int256(p.margin * p.leverage);
        return (notional * delta) / int256(p.entryPrice);
    }

    function _marginRatio(uint256 leverage) private view returns (uint256) {
        // (1/leverage) - maintenance, in 1e18 fixed point, floored at 0.
        uint256 inv = PRICE_SCALE / leverage;
        uint256 maint = (maintenanceMarginBps * PRICE_SCALE) / BPS_DENOMINATOR;
        return inv > maint ? inv - maint : 0;
    }

    function _liquidationPrice(bool isLong, uint256 entryPrice, uint256 leverage) private view returns (uint256) {
        if (leverage == 0 || entryPrice == 0) return 0;
        uint256 ratio = _marginRatio(leverage);
        if (isLong) {
            return (entryPrice * (PRICE_SCALE - ratio)) / PRICE_SCALE;
        } else {
            return (entryPrice * (PRICE_SCALE + ratio)) / PRICE_SCALE;
        }
    }

    function _isLiquidatable(Position storage p, uint256 price) private view returns (bool) {
        uint256 liq = _liquidationPrice(p.isLong, p.entryPrice, p.leverage);
        return p.isLong ? price <= liq : price >= liq;
    }
}
