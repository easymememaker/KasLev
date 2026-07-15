/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserProvider, Contract, JsonRpcProvider, ethers } from 'ethers';
import {
  DEFAULT_NETWORK,
  NETWORKS,
  NetworkKey,
  ORACLE_ABI,
  PERPS_ABI,
  VAULT_ABI,
  isSupportedNetwork,
} from './config';

/** The network the app is currently trading against. */
let activeKey: NetworkKey = DEFAULT_NETWORK;

/** Point the web3 layer at a different deployed L2. Idempotent. */
export function setActiveNetwork(key: NetworkKey): void {
  activeKey = key;
}

export function getActiveNetwork() {
  return NETWORKS[activeKey];
}

export { isSupportedNetwork };

/** The injected EIP-1193 provider (MetaMask or any EVM wallet), if present. */
function injected(): any {
  return (window as any).ethereum;
}

export function hasInjectedWallet(): boolean {
  return typeof injected() !== 'undefined';
}

/** keccak256 of a market symbol, e.g. assetId("KAS"). */
export function assetId(symbol: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(symbol));
}

/** Turn a raw tx/revert error into a short, human-readable reason. */
export function friendlyTxError(err: any): string {
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') return 'You rejected the request in your wallet.';
  const name: string | undefined = err?.revert?.name || err?.errorName;
  const blob = `${name || ''} ${err?.shortMessage || ''} ${err?.info?.error?.message || ''} ${err?.message || ''}`;
  const has = (s: string) => blob.toLowerCase().includes(s.toLowerCase());
  if (has('StalePrice') || has('ZeroPrice')) return 'Price feed is refreshing — please try again in a few seconds.';
  if (has('NotTradeable')) return 'This market is not open for trading.';
  if (has('InvalidLeverage')) return 'That leverage is not allowed for this market.';
  if (has('MarginOutOfRange')) return 'Collateral amount is outside the allowed range.';
  if (has('InsufficientValue')) return 'Not enough KAS sent to cover margin + fees.';
  if (has('insufficient funds')) return 'Your wallet does not have enough KAS for margin + fees + gas.';
  if (has('NotLiquidatable')) return 'Position is not liquidatable yet.';
  if (has('AlreadyClosed')) return 'This position is already closed.';
  if (err?.shortMessage) return err.shortMessage;
  return err?.message?.slice(0, 120) || 'Transaction failed.';
}

/** A read-only provider that talks to the active network's RPC directly (no wallet needed). */
export function readProvider(): JsonRpcProvider {
  return new JsonRpcProvider(getActiveNetwork().rpcUrl);
}

/**
 * Ensure the injected wallet is on the ACTIVE network, adding it if the wallet doesn't know it.
 */
export async function ensureNetwork(): Promise<void> {
  const net = getActiveNetwork();
  const eth = injected();
  if (!eth) throw new Error('No EVM wallet found. Install MetaMask.');
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: net.chainIdHex }],
    });
  } catch (err: any) {
    // 4902 = chain not added yet -> add it, then it becomes active.
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message || '')) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: net.chainIdHex,
            chainName: net.name,
            rpcUrls: [net.rpcUrl],
            nativeCurrency: net.nativeCurrency,
            blockExplorerUrls: [net.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
}

/** Request accounts and make sure we're on the active network. Returns the connected address. */
export async function connectWallet(): Promise<ConnectedWallet> {
  const eth = injected();
  if (!eth) throw new Error('No EVM wallet found. Install MetaMask to trade on-chain.');
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  await ensureNetwork();
  const chainIdHex: string = await eth.request({ method: 'eth_chainId' });
  return { address: accounts[0], chainId: parseInt(chainIdHex, 16) };
}

async function signer() {
  const eth = injected();
  if (!eth) throw new Error('No EVM wallet found.');
  const provider = new BrowserProvider(eth);
  return provider.getSigner();
}

function perpsWith(runner: any): Contract {
  return new Contract(getActiveNetwork().contracts.KasLevPerps, PERPS_ABI as unknown as string[], runner);
}

/** Native-coin balance (KAS/iKAS) of an address on the active network. */
export async function getNativeBalance(address: string): Promise<number> {
  const bal = await readProvider().getBalance(address);
  return Number(ethers.formatEther(bal));
}

/** Read-only KAS/USD price (1e18) currently on the active network's oracle. */
export async function getOraclePrice(symbol: string): Promise<{ price: number; updatedAt: number }> {
  const oracle = new Contract(getActiveNetwork().contracts.KasLevOracle, ORACLE_ABI as unknown as string[], readProvider());
  const [price, updatedAt] = await oracle.getPrice(assetId(symbol));
  return { price: Number(ethers.formatEther(price)), updatedAt: Number(updatedAt) };
}

/** Total pooled liquidity backing the protocol on the active network. */
export async function getPoolLiquidity(): Promise<number> {
  const vault = new Contract(getActiveNetwork().contracts.KasLevVault, VAULT_ABI as unknown as string[], readProvider());
  return Number(ethers.formatEther(await vault.totalLiquidity()));
}

export interface HouseRules {
  liqSharePct: number;
  maxProfitPct: number;
  maxPayoutPoolPct: number;
}

/** The transparent house-edge parameters, read live from the active network's contract. */
export async function getHouseRules(): Promise<HouseRules> {
  const perps = perpsWith(readProvider());
  const [liq, prof, pool] = await Promise.all([
    perps.liqShareBps(),
    perps.maxProfitBps(),
    perps.maxPayoutPoolBps(),
  ]);
  return {
    liqSharePct: Number(liq) / 100,
    maxProfitPct: Number(prof) / 100,
    maxPayoutPoolPct: Number(pool) / 100,
  };
}

export interface VaultStats {
  totalLiquidity: number;
  freeLiquidity: number;
  developerPrincipal: number;
  daysUntilUnlock: number;
  isUnlocked: boolean;
}

/** Live vault accounting from the active network (read-only, no wallet needed). */
export async function getVaultStats(): Promise<VaultStats> {
  const vault = new Contract(getActiveNetwork().contracts.KasLevVault, VAULT_ABI as unknown as string[], readProvider());
  const [total, free, principal, secs, unlocked] = await Promise.all([
    vault.totalLiquidity(),
    vault.freeLiquidity(),
    vault.developerPrincipal(),
    vault.timeUntilUnlock(),
    vault.isUnlocked(),
  ]);
  return {
    totalLiquidity: Number(ethers.formatEther(total)),
    freeLiquidity: Number(ethers.formatEther(free)),
    developerPrincipal: Number(ethers.formatEther(principal)),
    daysUntilUnlock: Number(secs) / 86400,
    isUnlocked: unlocked,
  };
}

export interface OnChainPosition {
  id: number;
  symbol: string;
  isLong: boolean;
  leverage: number;
  marginKas: number;
  entryPrice: number;
  /** null while the oracle is stale (the view reverts) — keep prior UI values. */
  liquidationPrice: number | null;
  /** null while the oracle is stale (the view reverts) — keep prior UI values. */
  pnlKas: number | null;
  closed: boolean;
}

export interface PositionCloseInfo {
  exitPrice: number;
  pnlKas: number;
  liquidated: boolean;
  txHash: string;
}

/**
 * How a position left the books, from the contract's own PositionClosed event —
 * lets the UI write an honest ledger entry for keeper liquidations and closes
 * made outside this session.
 */
export async function getPositionCloseInfo(positionId: number): Promise<PositionCloseInfo | null> {
  try {
    const perps = perpsWith(readProvider());
    const events = await perps.queryFilter(perps.filters.PositionClosed(positionId), -100_000);
    const ev: any = events[events.length - 1];
    if (!ev?.args) return null;
    return {
      exitPrice: Number(ethers.formatEther(ev.args.exitPrice)),
      pnlKas: Number(ethers.formatEther(ev.args.pnl)),
      liquidated: Boolean(ev.args.liquidated),
      txHash: ev.transactionHash,
    };
  } catch {
    return null;
  }
}

/** Quote the full cost (margin + dev fee + keeper fee) to open a position. */
export async function quoteOpenCost(leverage: number, marginKas: number) {
  const perps = perpsWith(readProvider());
  const margin = ethers.parseEther(String(marginKas));
  const [openFee, keeperFee, total] = await perps.quoteOpenCost(leverage, margin);
  return {
    openFeeKas: Number(ethers.formatEther(openFee)),
    keeperFeeKas: Number(ethers.formatEther(keeperFee)),
    totalKas: Number(ethers.formatEther(total)),
  };
}

/** Extra tx overrides required by the active network (e.g. Igra's min gas price). */
function txOverrides(): Record<string, bigint> {
  const min = getActiveNetwork().minGasPriceWei;
  return min ? { gasPrice: BigInt(min) } : {};
}

/**
 * Open a real leveraged position on-chain. Sends margin + fees as native KAS/iKAS.
 * Returns the transaction hash once mined.
 */
export async function openPositionOnChain(
  symbol: string,
  leverage: number,
  isLong: boolean,
  marginKas: number,
): Promise<{ txHash: string; positionId?: number }> {
  const perps = perpsWith(await signer());
  const margin = ethers.parseEther(String(marginKas));
  const [, , total] = await perps.quoteOpenCost(leverage, margin);
  const tx = await perps.openPosition(assetId(symbol), leverage, isLong, margin, { value: total, ...txOverrides() });
  const receipt = await tx.wait();

  // Try to read the emitted positionId.
  let positionId: number | undefined;
  const iface = new ethers.Interface(PERPS_ABI as unknown as string[]);
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'PositionOpened') positionId = Number(parsed.args.positionId);
    } catch {
      /* not our event */
    }
  }
  return { txHash: tx.hash, positionId };
}

/** Close one of the caller's positions on-chain. Returns the tx hash. */
export async function closePositionOnChain(positionId: number): Promise<{ txHash: string }> {
  const perps = perpsWith(await signer());
  const tx = await perps.closePosition(positionId, txOverrides());
  await tx.wait();
  return { txHash: tx.hash };
}

/** Fetch all (open) positions for a trader from the active network, with live PnL. */
export async function getTraderPositions(trader: string, symbolFor: (id: string) => string): Promise<OnChainPosition[]> {
  const perps = perpsWith(readProvider());
  const ids: bigint[] = await perps.getTraderPositions(trader);
  const out: OnChainPosition[] = [];
  for (const idBig of ids) {
    const id = Number(idBig);
    const p = await perps.positions(id);
    if (p.closed) continue;
    // These views revert while the oracle is stale — report null so the UI keeps
    // its previous numbers instead of rendering $0 liquidation prices.
    let pnlKas: number | null = null;
    let liq: number | null = null;
    try {
      pnlKas = Number(ethers.formatEther(await perps.currentPnL(id)));
      liq = Number(ethers.formatEther(await perps.liquidationPrice(id)));
    } catch {
      /* oracle stale */
    }
    out.push({
      id,
      symbol: symbolFor(p.assetId),
      isLong: p.isLong,
      leverage: Number(p.leverage),
      marginKas: Number(ethers.formatEther(p.margin)),
      entryPrice: Number(ethers.formatEther(p.entryPrice)),
      liquidationPrice: liq,
      pnlKas,
      closed: p.closed,
    });
  }
  return out;
}
