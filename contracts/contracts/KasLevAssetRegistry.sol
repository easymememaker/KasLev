// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KasLevAssetRegistry
 * @notice Public registry of the assets ("pools"/markets) tradeable on KasLev.
 *
 * @dev TRANSPARENCY & LISTING RULES (per protocol spec)
 *      - Only the developer (owner) may list new assets. This controlled listing exists
 *        solely to reduce scams, fake tokens and malicious contracts — NOT to hide anything.
 *      - The complete list of markets, their max leverage, and enabled/disabled status is
 *        publicly readable and every change emits an event.
 *      - Listing an asset here does not move or custody any funds. It only declares which
 *        markets the {KasLevPerps} engine will accept positions on.
 */
contract KasLevAssetRegistry is Ownable {
    struct Asset {
        bytes32 id; // keccak256(symbol)
        string symbol; // human-readable, e.g. "KAS", "NACHO"
        uint256 maxLeverage; // hard cap on leverage for this market
        bool enabled; // trading currently allowed
        bool exists; // slot initialised
    }

    /// @notice assetId => asset metadata.
    mapping(bytes32 => Asset) public assets;

    /// @notice Enumerable list of every listed assetId (append-only).
    bytes32[] public assetIds;

    event AssetListed(bytes32 indexed id, string symbol, uint256 maxLeverage);
    event AssetMaxLeverageUpdated(bytes32 indexed id, uint256 oldMax, uint256 newMax);
    event AssetEnabledSet(bytes32 indexed id, bool enabled);

    error AlreadyListed();
    error NotListed();
    error EmptySymbol();
    error ZeroLeverage();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Compute the canonical id for a symbol. Pure helper for off-chain callers.
    function assetIdOf(string calldata symbol) external pure returns (bytes32) {
        return keccak256(bytes(symbol));
    }

    /**
     * @notice List a new tradeable market. Developer (owner) only.
     * @param symbol       Ticker symbol; its keccak256 becomes the assetId.
     * @param maxLeverage  Maximum leverage permitted on this market.
     */
    function listAsset(string calldata symbol, uint256 maxLeverage) external onlyOwner returns (bytes32 id) {
        if (bytes(symbol).length == 0) revert EmptySymbol();
        if (maxLeverage == 0) revert ZeroLeverage();
        id = keccak256(bytes(symbol));
        if (assets[id].exists) revert AlreadyListed();

        assets[id] = Asset({id: id, symbol: symbol, maxLeverage: maxLeverage, enabled: true, exists: true});
        assetIds.push(id);
        emit AssetListed(id, symbol, maxLeverage);
    }

    /// @notice Adjust the maximum leverage of an existing market. Owner only.
    function setMaxLeverage(bytes32 id, uint256 maxLeverage) external onlyOwner {
        Asset storage a = assets[id];
        if (!a.exists) revert NotListed();
        if (maxLeverage == 0) revert ZeroLeverage();
        emit AssetMaxLeverageUpdated(id, a.maxLeverage, maxLeverage);
        a.maxLeverage = maxLeverage;
    }

    /// @notice Enable or disable trading on a market without delisting it. Owner only.
    function setEnabled(bytes32 id, bool enabled) external onlyOwner {
        Asset storage a = assets[id];
        if (!a.exists) revert NotListed();
        a.enabled = enabled;
        emit AssetEnabledSet(id, enabled);
    }

    /// @notice True only if the market exists and is currently enabled for trading.
    function isTradeable(bytes32 id) external view returns (bool) {
        Asset storage a = assets[id];
        return a.exists && a.enabled;
    }

    /// @notice Max leverage for a listed market (reverts if not listed).
    function maxLeverageOf(bytes32 id) external view returns (uint256) {
        Asset storage a = assets[id];
        if (!a.exists) revert NotListed();
        return a.maxLeverage;
    }

    /// @notice Total number of listed markets.
    function assetCount() external view returns (uint256) {
        return assetIds.length;
    }
}
