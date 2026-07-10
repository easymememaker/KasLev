/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On-chain configuration for the KasLev protocol on the Kaspa EVM L2.
 *
 * These are the live contract addresses deployed to the Kasplex zkEVM testnet
 * (see contracts/deployments/kasplexTestnet.json). The native gas/collateral asset
 * on this chain is KAS (18 decimals).
 */

export const KASPLEX_TESTNET = {
  chainIdDec: 167012,
  chainIdHex: '0x28c64',
  name: 'Kasplex zkEVM Testnet',
  rpcUrl: 'https://rpc.kasplextest.xyz',
  explorer: 'https://explorer.testnet.kasplextest.xyz',
  nativeCurrency: { name: 'Kaspa', symbol: 'KAS', decimals: 18 },
} as const;

export const CONTRACTS = {
  KasLevOracle: '0xD4615AA4b4A8134A65F8a003B77E1CD38d5c268f',
  KasLevAssetRegistry: '0x3bAaF0d31105aa0D92eF3DA1d7574c4EDB70d90a',
  KasLevVault: '0xabD3bF3fd4EF65766753b1B4Eb924a4792d56Fb7',
  KasLevPerps: '0x5fF6E0A7eFa4eb23a42855Fb05bDd6802fb98157',
} as const;

// Minimal ABIs — only the fragments the frontend actually calls.
export const PERPS_ABI = [
  'function openPosition(bytes32 assetId, uint256 leverage, bool isLong, uint256 margin) payable returns (uint256)',
  'function closePosition(uint256 positionId)',
  'function quoteOpenCost(uint256 leverage, uint256 margin) view returns (uint256 openFee, uint256 keeperFee_, uint256 total)',
  'function getFeeBps(uint256 leverage) view returns (uint16)',
  'function getTraderPositions(address trader) view returns (uint256[])',
  'function positions(uint256) view returns (address trader, bytes32 assetId, bool isLong, bool closed, uint256 leverage, uint256 margin, uint256 entryPrice, uint16 feeBps, uint256 openedAt)',
  'function currentPnL(uint256 positionId) view returns (int256)',
  'function liquidationPrice(uint256 positionId) view returns (uint256)',
  'function isLiquidatable(uint256 positionId) view returns (bool)',
  'event PositionOpened(uint256 indexed positionId, address indexed trader, bytes32 indexed assetId, bool isLong, uint256 leverage, uint256 margin, uint256 entryPrice, uint256 openFee, uint256 liquidationPrice)',
  'event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 exitPrice, int256 pnl, uint256 closeFee, uint256 payout, bool liquidated)',
] as const;

export const ORACLE_ABI = [
  'function getPrice(bytes32 assetId) view returns (uint256 price, uint256 updatedAt)',
] as const;

export const VAULT_ABI = [
  'function totalLiquidity() view returns (uint256)',
  'function developerPrincipal() view returns (uint256)',
  'function timeUntilUnlock() view returns (uint256)',
  'function isUnlocked() view returns (bool)',
] as const;

export const REGISTRY_ABI = [
  'function isTradeable(bytes32 id) view returns (bool)',
  'function maxLeverageOf(bytes32 id) view returns (uint256)',
] as const;
