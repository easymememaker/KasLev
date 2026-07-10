// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title KasLevVault
 * @notice Custodies all protocol liquidity in native KAS and acts as the counterparty
 *         balance-sheet for leveraged positions opened through {KasLevPerps}.
 *
 * @dev CORE INVARIANTS (per protocol spec — every rule below is visible & enforced here):
 *
 *      1. DEVELOPER SEED IS LOCKED FOR A FIXED PERIOD.
 *         The developer deposits an initial liquidity contribution exactly once via
 *         {depositInitialLiquidity}. That deposit is time-locked for `lockDuration`
 *         (100 days by default) from the moment of deposit.
 *
 *      2. DEVELOPER CAN ONLY EVER WITHDRAW THE ORIGINAL PRINCIPAL — NOTHING MORE.
 *         {withdrawDeveloperPrincipal} can move at most `developerPrincipal` KAS, once,
 *         and only after the lock expires. All liquidity accumulated by the protocol
 *         (net trader losses) can never be withdrawn by the developer and belongs to the
 *         pool permanently to support trading.
 *
 *      3. NO OTHER PRIVILEGED WITHDRAWAL PATH EXISTS.
 *         There is no owner "sweep", no backdoor, no emergency drain. The only way value
 *         leaves this vault is (a) trader payouts settled by the authorized Perps engine,
 *         or (b) the one-time developer principal withdrawal. Both are fully event-logged.
 *
 *      4. TRADING FEES NEVER ENTER THIS VAULT.
 *         Developer fees are routed by {KasLevPerps} straight to the fee wallet and never
 *         touch pool liquidity, keeping "developer revenue == trading fees only" provable.
 */
contract KasLevVault is Ownable, ReentrancyGuard {
    using Address for address payable;

    /// @notice The developer address that funds and may later reclaim the seed principal.
    address public immutable developer;

    /// @notice The authorized trading engine; the only contract allowed to settle payouts.
    address public perps;

    /// @notice Exact amount of the developer's initial seed contribution (wei of KAS).
    uint256 public developerPrincipal;

    /// @notice Timestamp after which the developer principal becomes withdrawable.
    uint256 public lockExpiry;

    /// @notice Lock duration applied to the seed at deposit time (seconds).
    uint256 public immutable lockDuration;

    /// @notice True once the seed has been deposited.
    bool public seedDeposited;

    /// @notice True once the developer has reclaimed the principal (can only happen once).
    bool public principalWithdrawn;

    event PerpsSet(address indexed perps);
    event InitialLiquidityDeposited(address indexed developer, uint256 amount, uint256 lockExpiry);
    event LiquidityAdded(address indexed from, uint256 amount);
    event MarginReceived(address indexed trader, uint256 amount);
    event PayoutSettled(address indexed to, uint256 amount);
    event DeveloperPrincipalWithdrawn(address indexed developer, uint256 amount);

    error NotPerps();
    error PerpsAlreadySet();
    error ZeroAddress();
    error OnlyDeveloper();
    error SeedAlreadyDeposited();
    error SeedNotDeposited();
    error ZeroAmount();
    error StillLocked();
    error AlreadyWithdrawn();
    error InsufficientLiquidity();

    modifier onlyPerps() {
        if (msg.sender != perps) revert NotPerps();
        _;
    }

    /**
     * @param initialOwner   Protocol owner (governs asset listing/params, NOT the pool funds).
     * @param developer_     Address that will deposit and may reclaim the seed principal.
     * @param lockDuration_  Seconds the seed stays locked (spec default: 100 days).
     */
    constructor(address initialOwner, address developer_, uint256 lockDuration_) Ownable(initialOwner) {
        if (developer_ == address(0)) revert ZeroAddress();
        developer = developer_;
        lockDuration = lockDuration_;
    }

    // ---------------------------------------------------------------------
    // Wiring
    // ---------------------------------------------------------------------

    /**
     * @notice One-time link to the trading engine. After this is set it can never change,
     *         so the set of addresses able to move liquidity is fixed and auditable.
     */
    function setPerps(address perps_) external onlyOwner {
        if (perps != address(0)) revert PerpsAlreadySet();
        if (perps_ == address(0)) revert ZeroAddress();
        perps = perps_;
        emit PerpsSet(perps_);
    }

    // ---------------------------------------------------------------------
    // Liquidity in
    // ---------------------------------------------------------------------

    /**
     * @notice Developer deposits the initial seed liquidity. Callable once, by the
     *         developer only. Starts the 100-day lock. The seed is working liquidity:
     *         it backs trader payouts and is therefore subject to normal pool P&L while
     *         active — but the developer can never withdraw more than this exact amount.
     */
    function depositInitialLiquidity() external payable {
        if (msg.sender != developer) revert OnlyDeveloper();
        if (seedDeposited) revert SeedAlreadyDeposited();
        if (msg.value == 0) revert ZeroAmount();

        seedDeposited = true;
        developerPrincipal = msg.value;
        lockExpiry = block.timestamp + lockDuration;
        emit InitialLiquidityDeposited(developer, msg.value, lockExpiry);
    }

    /**
     * @notice Optional permissionless liquidity donation. Anyone may strengthen the pool;
     *         donated funds become permanent protocol liquidity (never developer-owned).
     */
    function addLiquidity() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit LiquidityAdded(msg.sender, msg.value);
    }

    /**
     * @notice Receive trader margin escrowed on position open. Perps engine only.
     * @dev The `trader` parameter is for event indexing/traceability only.
     */
    function depositMargin(address trader) external payable onlyPerps {
        if (msg.value == 0) revert ZeroAmount();
        emit MarginReceived(trader, msg.value);
    }

    // ---------------------------------------------------------------------
    // Liquidity out (only via the authorized engine, or the one-time dev principal)
    // ---------------------------------------------------------------------

    /**
     * @notice Pay `amount` KAS to `to` as settlement of a closed/liquidated position.
     *         Callable exclusively by the authorized Perps engine.
     * @dev This is the ONLY way trader-facing value leaves the vault. Uses CEI + a
     *      reentrancy guard; the guard on {KasLevPerps} functions provides defense in depth.
     */
    function settlePayout(address to, uint256 amount) external onlyPerps nonReentrant {
        if (amount == 0) return; // nothing to pay (e.g. full-loss liquidation)
        if (address(this).balance < amount) revert InsufficientLiquidity();
        payable(to).sendValue(amount);
        emit PayoutSettled(to, amount);
    }

    /**
     * @notice Developer reclaims the original seed principal — and only that — after the
     *         lock expires. Enforces spec rule: "may withdraw only the original amount".
     * @dev Withdraws min(principal, balance): can never exceed the principal (protocol
     *      profits stay in the pool) and never reverts-lock funds if the pool drew down
     *      below principal while acting as counterparty (developer bore that LP risk).
     */
    function withdrawDeveloperPrincipal() external nonReentrant {
        if (msg.sender != developer) revert OnlyDeveloper();
        if (!seedDeposited) revert SeedNotDeposited();
        if (block.timestamp < lockExpiry) revert StillLocked();
        if (principalWithdrawn) revert AlreadyWithdrawn();

        principalWithdrawn = true;

        uint256 bal = address(this).balance;
        uint256 amount = developerPrincipal <= bal ? developerPrincipal : bal;
        if (amount > 0) {
            payable(developer).sendValue(amount);
        }
        emit DeveloperPrincipalWithdrawn(developer, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Total KAS currently held by the vault (seed + retained P&L + escrowed margin).
    function totalLiquidity() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Seconds remaining until the developer principal unlocks (0 once unlocked).
    function timeUntilUnlock() external view returns (uint256) {
        if (!seedDeposited || block.timestamp >= lockExpiry) return 0;
        return lockExpiry - block.timestamp;
    }

    /// @notice Convenience flag mirroring {LiquidityPool.isUnlocked} in the app.
    function isUnlocked() external view returns (bool) {
        return seedDeposited && block.timestamp >= lockExpiry;
    }
}
