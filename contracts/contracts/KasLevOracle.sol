// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/**
 * @title KasLevOracle
 * @notice Transparent, keeper-updated price oracle for KasLev markets.
 *
 * @dev DESIGN & TRANSPARENCY NOTES
 *      - Prices are pushed on-chain by authorized reporter addresses. This mirrors the
 *        off-chain price proxy already used by the KasLev app (Gate.io / MEXC / CoinGecko),
 *        surfaced on-chain so every settlement is verifiable.
 *      - Every price write emits {PriceUpdated}. There are no hidden or privileged reads.
 *      - The set of reporters is publicly visible via {isReporter} and change events.
 *      - This is intentionally a simple, auditable feed. A production deployment SHOULD
 *        migrate to a decentralized oracle (multi-source median / TWAP) — the consuming
 *        contracts only depend on the {IPriceOracle} interface, so the feed can be swapped
 *        without touching protocol logic.
 */
contract KasLevOracle is IPriceOracle, Ownable {
    struct PriceData {
        uint256 price; // USD, 1e18 scaled
        uint256 updatedAt; // unix timestamp
    }

    /// @notice assetId => latest price data.
    mapping(bytes32 => PriceData) private _prices;

    /// @notice Addresses permitted to push prices. Publicly readable.
    mapping(address => bool) public isReporter;

    event ReporterUpdated(address indexed reporter, bool allowed);
    event PriceUpdated(bytes32 indexed assetId, uint256 price, uint256 updatedAt);

    error NotReporter();
    error ZeroPrice();
    error LengthMismatch();

    modifier onlyReporter() {
        if (!isReporter[msg.sender]) revert NotReporter();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        // The deployer/owner is a reporter by default; additional keepers can be added.
        isReporter[initialOwner] = true;
        emit ReporterUpdated(initialOwner, true);
    }

    /// @notice Grant or revoke a price reporter. Owner only, fully event-logged.
    function setReporter(address reporter, bool allowed) external onlyOwner {
        isReporter[reporter] = allowed;
        emit ReporterUpdated(reporter, allowed);
    }

    /// @notice Push a single price. Price must be strictly positive.
    function setPrice(bytes32 assetId, uint256 price) external onlyReporter {
        if (price == 0) revert ZeroPrice();
        _prices[assetId] = PriceData({price: price, updatedAt: block.timestamp});
        emit PriceUpdated(assetId, price, block.timestamp);
    }

    /// @notice Push many prices in one transaction (gas-efficient keeper updates).
    function setPrices(bytes32[] calldata assetIds, uint256[] calldata prices) external onlyReporter {
        if (assetIds.length != prices.length) revert LengthMismatch();
        for (uint256 i = 0; i < assetIds.length; i++) {
            uint256 p = prices[i];
            if (p == 0) revert ZeroPrice();
            _prices[assetIds[i]] = PriceData({price: p, updatedAt: block.timestamp});
            emit PriceUpdated(assetIds[i], p, block.timestamp);
        }
    }

    /// @inheritdoc IPriceOracle
    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory d = _prices[assetId];
        return (d.price, d.updatedAt);
    }
}
