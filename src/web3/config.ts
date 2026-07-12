/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On-chain configuration for the KasLev protocol across the Kaspa EVM L2s it is deployed to.
 *
 * The app's `activeChain` values map to the entries below. Only the L2s that actually run
 * EVM smart contracts are tradeable here; the native gas/collateral asset is KAS (Kasplex)
 * or iKAS (Igra), both 18 decimals.
 */

export type NetworkKey = 'L2_KASPLEX' | 'L2_IGRA';

export interface NetworkConfig {
  key: NetworkKey;
  chainIdDec: number;
  chainIdHex: string;
  name: string;
  rpcUrl: string;
  explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Minimum gas price (wei) the chain enforces, if any. */
  minGasPriceWei?: string;
  contracts: {
    KasLevOracle: string;
    KasLevAssetRegistry: string;
    KasLevVault: string;
    KasLevPerps: string;
  };
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  // Kasplex zkEVM public testnet.
  L2_KASPLEX: {
    key: 'L2_KASPLEX',
    chainIdDec: 167012,
    chainIdHex: '0x28c64',
    name: 'Kasplex zkEVM Testnet',
    rpcUrl: 'https://rpc.kasplextest.xyz',
    explorer: 'https://explorer.testnet.kasplextest.xyz',
    nativeCurrency: { name: 'Kaspa', symbol: 'KAS', decimals: 18 },
    contracts: {
      KasLevOracle: '0x87C37c72378a616050a5503E472e36F901f61f1e',
      KasLevAssetRegistry: '0xdaB29E9C6A11eB403Ab8AeF6459751610b0a23a3',
      KasLevVault: '0x1Ac0b02E1e41e944E1A8F93ffcF22caeF6CC26B7',
      KasLevPerps: '0x12EdcCE0875c3182300200d5ed235849342B393E',
    },
  },
  // Igra Galleon public testnet (enforces a 2000 gwei minimum gas price).
  L2_IGRA: {
    key: 'L2_IGRA',
    chainIdDec: 38836,
    chainIdHex: '0x97b4',
    name: 'Igra Galleon Testnet',
    rpcUrl: 'https://galleon-testnet.igralabs.com:8545',
    explorer: 'https://explorer.galleon-testnet.igralabs.com',
    nativeCurrency: { name: 'Igra KAS', symbol: 'iKAS', decimals: 18 },
    minGasPriceWei: '2000000000000', // 2000 gwei
    contracts: {
      KasLevOracle: '0xAe92b522836fBCe04491794cD841600792cA6fBE',
      KasLevAssetRegistry: '0x3D19d67dd23093a74027e096Ddcf6874D336582d',
      KasLevVault: '0x048129c68A48Ded374e91D64bC1A567eD52964f1',
      KasLevPerps: '0xC13A26f28D9B1281A87b2e2BC14E0260F38C47B0',
    },
  },
};

export const DEFAULT_NETWORK: NetworkKey = 'L2_KASPLEX';

/** True for app chains that actually have KasLev contracts deployed (are tradeable on-chain). */
export function isSupportedNetwork(chain: string): chain is NetworkKey {
  return chain === 'L2_KASPLEX' || chain === 'L2_IGRA';
}

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
  'function liqShareBps() view returns (uint256)',
  'function maxProfitBps() view returns (uint256)',
  'function maxPayoutPoolBps() view returns (uint256)',
  'event PositionOpened(uint256 indexed positionId, address indexed trader, bytes32 indexed assetId, bool isLong, uint256 leverage, uint256 margin, uint256 entryPrice, uint256 openFee, uint256 liquidationPrice)',
  'event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 exitPrice, int256 pnl, uint256 closeFee, uint256 payout, bool liquidated)',
] as const;

export const ORACLE_ABI = [
  'function getPrice(bytes32 assetId) view returns (uint256 price, uint256 updatedAt)',
] as const;

export const VAULT_ABI = [
  'function totalLiquidity() view returns (uint256)',
  'function freeLiquidity() view returns (uint256)',
  'function developerPrincipal() view returns (uint256)',
  'function timeUntilUnlock() view returns (uint256)',
  'function isUnlocked() view returns (bool)',
] as const;
