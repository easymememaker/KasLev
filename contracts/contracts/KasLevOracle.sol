// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/**
 * @title KasLevOracle
 * @notice Multi-source median price oracle for KasLev markets.
 *
 * @dev WHY MEDIAN-OF-MANY (the "fair oracle"):
 *      A single-source oracle controlled by the house is a conflict of interest — the party
 *      that profits from liquidations must not be the sole party that sets the price. This
 *      oracle instead aggregates prices from MULTIPLE independent reporters and returns the
 *      MEDIAN. The median is robust: with N reporters it takes ⌈(N+1)/2⌉ colluding sources to
 *      move the reported price, so a single bad/hacked reporter cannot force liquidations.
 *
 *      Fairness comes from operating ≥3 INDEPENDENT reporters (e.g. separate keepers each
 *      reading a different exchange). `minSources` enforces a floor: if fewer than that many
 *      fresh prices exist, {getPrice} returns 0 and the protocol refuses to trade — better to
 *      pause than to settle on a thin/manipulable price.
 *
 *      This is honest about its limits: reporters are still permissioned. It is a large step
 *      up from single-source, and the {IPriceOracle} interface is unchanged, so it can later
 *      be swapped for a fully decentralized oracle network without touching protocol logic.
 */
contract KasLevOracle is IPriceOracle, Ownable {
    struct Report {
        uint256 price; // USD, 1e18 scaled
        uint256 updatedAt; // unix timestamp
    }

    /// @notice assetId => reporter => their latest submitted price.
    mapping(bytes32 => mapping(address => Report)) private _reports;

    /// @notice Whether an address may submit prices.
    mapping(address => bool) public isReporter;

    /// @notice Enumerable list of reporters (used to aggregate the median).
    address[] public reporters;

    /// @notice Max age of a report to be counted as fresh (seconds).
    uint256 public maxAge = 300;

    /// @notice Minimum number of fresh reports required for a valid median price.
    uint256 public minSources = 1;

    event ReporterUpdated(address indexed reporter, bool allowed);
    event ParamsUpdated(uint256 maxAge, uint256 minSources);
    event PriceReported(bytes32 indexed assetId, address indexed reporter, uint256 price, uint256 updatedAt);

    error NotReporter();
    error ZeroPrice();
    error LengthMismatch();
    error BadParams();

    modifier onlyReporter() {
        if (!isReporter[msg.sender]) revert NotReporter();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        _setReporter(initialOwner, true);
    }

    // ---------------------------------------------------------------------
    // Reporter & parameter administration (owner)
    // ---------------------------------------------------------------------

    function setReporter(address reporter, bool allowed) external onlyOwner {
        _setReporter(reporter, allowed);
    }

    function _setReporter(address reporter, bool allowed) internal {
        if (allowed && !isReporter[reporter]) {
            isReporter[reporter] = true;
            reporters.push(reporter);
        } else if (!allowed && isReporter[reporter]) {
            isReporter[reporter] = false;
            uint256 n = reporters.length;
            for (uint256 i = 0; i < n; i++) {
                if (reporters[i] == reporter) {
                    reporters[i] = reporters[n - 1];
                    reporters.pop();
                    break;
                }
            }
        }
        emit ReporterUpdated(reporter, allowed);
    }

    /**
     * @notice Tune freshness and the minimum-sources floor.
     * @dev On mainnet set `minSources` to at least 3 and run independent reporters.
     */
    function setParams(uint256 maxAge_, uint256 minSources_) external onlyOwner {
        if (maxAge_ == 0 || minSources_ == 0) revert BadParams();
        maxAge = maxAge_;
        minSources = minSources_;
        emit ParamsUpdated(maxAge_, minSources_);
    }

    function reporterCount() external view returns (uint256) {
        return reporters.length;
    }

    // ---------------------------------------------------------------------
    // Price submission (reporters)
    // ---------------------------------------------------------------------

    function setPrice(bytes32 assetId, uint256 price) external onlyReporter {
        _report(assetId, price);
    }

    function setPrices(bytes32[] calldata assetIds, uint256[] calldata prices) external onlyReporter {
        if (assetIds.length != prices.length) revert LengthMismatch();
        for (uint256 i = 0; i < assetIds.length; i++) {
            _report(assetIds[i], prices[i]);
        }
    }

    function _report(bytes32 assetId, uint256 price) internal {
        if (price == 0) revert ZeroPrice();
        _reports[assetId][msg.sender] = Report({price: price, updatedAt: block.timestamp});
        emit PriceReported(assetId, msg.sender, price, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Aggregation
    // ---------------------------------------------------------------------

    /// @inheritdoc IPriceOracle
    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 updatedAt) {
        uint256 n = reporters.length;
        uint256[] memory fresh = new uint256[](n);
        uint256 count;
        uint256 newest;

        for (uint256 i = 0; i < n; i++) {
            Report memory r = _reports[assetId][reporters[i]];
            if (r.price > 0 && block.timestamp - r.updatedAt <= maxAge) {
                fresh[count] = r.price;
                count++;
                if (r.updatedAt > newest) newest = r.updatedAt;
            }
        }

        if (count == 0 || count < minSources) return (0, 0);

        _sort(fresh, count);
        if (count % 2 == 1) {
            price = fresh[count / 2];
        } else {
            price = (fresh[count / 2 - 1] + fresh[count / 2]) / 2;
        }
        updatedAt = newest;
    }

    /// @notice How many fresh sources currently back a market's price (transparency helper).
    function freshSourceCount(bytes32 assetId) external view returns (uint256 count) {
        uint256 n = reporters.length;
        for (uint256 i = 0; i < n; i++) {
            Report memory r = _reports[assetId][reporters[i]];
            if (r.price > 0 && block.timestamp - r.updatedAt <= maxAge) count++;
        }
    }

    /// @dev In-place insertion sort of the first `len` entries. len is tiny (reporter count).
    function _sort(uint256[] memory a, uint256 len) internal pure {
        for (uint256 i = 1; i < len; i++) {
            uint256 key = a[i];
            uint256 j = i;
            while (j > 0 && a[j - 1] > key) {
                a[j] = a[j - 1];
                j--;
            }
            a[j] = key;
        }
    }
}
