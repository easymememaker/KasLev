// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IPriceOracle
 * @notice Minimal, transparent price feed interface consumed by the KasLev protocol.
 * @dev Prices are reported in USD with 18 decimals of precision (1e18 == $1.00).
 *      Every consumer must enforce its own staleness policy using `updatedAt`.
 */
interface IPriceOracle {
    /**
     * @param assetId keccak256 identifier of the market symbol (e.g. keccak256("KAS")).
     * @return price     USD price scaled by 1e18.
     * @return updatedAt Unix timestamp at which `price` was last written.
     */
    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 updatedAt);
}
