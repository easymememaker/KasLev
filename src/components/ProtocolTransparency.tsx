/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Unlock, FileCode, CheckCircle2, Coins, ExternalLink } from 'lucide-react';
import { LiquidityPool } from '../types';
import { NETWORKS } from '../web3/config';

interface ProtocolTransparencyProps {
  pool: LiquidityPool;
  devWalletAddress: string;
}

/**
 * Protocol Audits tab — everything shown here is REAL: verbatim excerpts of the
 * deployed Solidity sources, the live on-chain pool numbers (synced from the vault),
 * and the actual contract addresses on each testnet with explorer links.
 */
export default function ProtocolTransparency({ pool }: ProtocolTransparencyProps) {
  const [activeCodeTab, setActiveCodeTab] = useState<'fees' | 'vault' | 'oracle'>('fees');

  // Verbatim from contracts/contracts/KasLevPerps.sol — the deterministic fee ladder
  // and the exact charge taken when a position opens.
  const feeModelCode = `// KasLevPerps.sol — deterministic fee schedule (verbatim excerpt)

/// @notice Public, deterministic fee (bps) for a given leverage.
function getFeeBps(uint256 leverage) public view returns (uint16) {
    if (leverage <= stdMaxLeverage) return stdFeeBps;    // <= 50x   -> 1%
    if (leverage < floorLeverage)   return highRiskFeeBps; // < 10,000x -> 5%
    if (leverage < megaLeverage)    return floorFeeBps;   // 10,000x  -> 1%
    if (leverage < hyperLeverage)   return megaFeeBps;    // 100,000x -> 2%
    return hyperFeeBps;                                   // 1,000,000x -> 5%
}

function openPosition(bytes32 assetId, uint256 leverage, bool isLong, uint256 margin)
    external payable
{
    if (leverage == 0 || leverage > effectiveCap) revert InvalidLeverage();
    if (margin < minMargin || margin > maxMargin) revert MarginOutOfRange();

    uint16  feeBps  = getFeeBps(leverage);
    uint256 openFee = (margin * feeBps) / BPS_DENOMINATOR;
    uint256 required = margin + openFee + keeperFee;
    if (msg.value < required) revert InsufficientValue();

    uint256 entryPrice = _freshPrice(assetId); // reverts on stale/zero oracle
    // ... margin escrowed in the vault, fee routed to the fee wallet,
    //     excess msg.value refunded. Fee tiers capped at 10% by the contract.
}`;

  // Verbatim from contracts/contracts/KasLevVault.sol — the seed lock invariants.
  const vaultLockCode = `// KasLevVault.sol — developer seed lock (verbatim excerpt)

// CORE INVARIANTS (enforced by code, not promises):
//  1. Developer seed is locked for a fixed period (100 days by default).
//  2. Developer can ONLY EVER withdraw the original principal — nothing more.
//  3. No other privileged withdrawal path exists: no sweep, no backdoor.
//  4. Trading fees never enter this vault.

function withdrawDeveloperPrincipal() external nonReentrant {
    if (msg.sender != developer)       revert OnlyDeveloper();
    if (!seedDeposited)                revert SeedNotDeposited();
    if (block.timestamp < lockExpiry)  revert StillLocked();
    if (principalWithdrawn)            revert AlreadyWithdrawn();

    principalWithdrawn = true;

    uint256 avail  = freeLiquidity(); // never touches open-position escrow
    uint256 amount = developerPrincipal <= avail ? developerPrincipal : avail;
    if (amount > 0) payable(developer).sendValue(amount);
    emit DeveloperPrincipalWithdrawn(developer, amount);
}`;

  // Verbatim from contracts/contracts/KasLevOracle.sol — median price aggregation.
  const oracleCode = `// KasLevOracle.sol — multi-source MEDIAN oracle (verbatim excerpt)

// WHY MEDIAN-OF-MANY: the party that profits from liquidations must not be
// the sole party that sets the price. With N reporters it takes a majority
// of colluding sources to move the reported price.

function getPrice(bytes32 assetId) external view
    returns (uint256 price, uint256 updatedAt)
{
    uint256 n = reporters.length;
    uint256[] memory fresh = new uint256[](n);
    uint256 count; uint256 newest;

    for (uint256 i = 0; i < n; i++) {
        Report memory r = _reports[assetId][reporters[i]];
        if (r.price > 0 && block.timestamp - r.updatedAt <= maxAge) {
            fresh[count] = r.price; count++;
            if (r.updatedAt > newest) newest = r.updatedAt;
        }
    }

    // Fewer than minSources fresh reports -> refuse to price (trading pauses;
    // better to halt than settle on a thin/manipulable price).
    if (count == 0 || count < minSources) return (0, 0);

    _sort(fresh, count);
    price = count % 2 == 1
        ? fresh[count / 2]
        : (fresh[count / 2 - 1] + fresh[count / 2]) / 2;
    updatedAt = newest;
}`;

  const contractRows: { label: string; key: keyof (typeof NETWORKS)['L2_KASPLEX']['contracts'] }[] = [
    { label: 'Perps Engine', key: 'KasLevPerps' },
    { label: 'Liquidity Vault', key: 'KasLevVault' },
    { label: 'Median Oracle', key: 'KasLevOracle' },
    { label: 'Asset Registry', key: 'KasLevAssetRegistry' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-7xl mx-auto" id="transparency-tab-content">
      {/* LEFT COLUMN: Pool Status & Timers (Col Span 5) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Pool Metrics Card — live values synced from the vault contract */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg relative overflow-hidden" id="liquidity-pool-stats">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-kaspa/10 to-transparent pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Coins className="text-kaspa w-5 h-5" />
              <h3 className="font-display font-bold text-lg text-white">Liquidity Vault</h3>
            </div>
            <span className="text-[10px] bg-kaspa/10 text-kaspa px-2 py-0.5 rounded-full font-mono border border-kaspa/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-kaspa animate-pulse" /> live on-chain
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-bg-darker p-4 rounded-lg border border-border-dark flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 block font-mono">Total Pool Balance</span>
                <span className="text-2xl font-mono font-bold text-white">
                  {(pool.totalKAS).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm text-kaspa">KAS</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] bg-kaspa-dark/50 text-kaspa px-2 py-0.5 rounded-full font-mono border border-kaspa/10">Active</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg-darker p-3 rounded-lg border border-border-dark">
                <span className="text-[10px] text-gray-400 block font-mono">Developer Seed (locked)</span>
                <span className="text-base font-mono font-bold text-white">
                  {pool.developerContribution.toLocaleString()} KAS
                </span>
              </div>
              <div className="bg-bg-darker p-3 rounded-lg border border-border-dark">
                <span className="text-[10px] text-gray-400 block font-mono">Accumulated Fees <span className="text-gray-600">·sim</span></span>
                <span className="text-base font-mono font-bold text-kaspa">
                  {pool.accumulatedFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KAS
                </span>
              </div>
            </div>

            {/* Lock Status Section — countdown mirrors the vault's lockExpiry */}
            <div className={`p-4 rounded-lg border flex flex-col gap-3 transition-colors ${
              pool.isUnlocked
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {pool.isUnlocked ? (
                    <Unlock className="text-emerald-400 w-5 h-5" />
                  ) : (
                    <Lock className="text-amber-400 w-5 h-5 animate-pulse" />
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      {pool.isUnlocked ? 'Developer Lock Expired' : 'Developer Lock Active'}
                    </h4>
                    <p className="text-[11px] text-gray-400">Locked duration: {pool.lockExpiryDays > 100 ? pool.lockExpiryDays : 100} Days</p>
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-bold text-white">
                  {pool.lockExpiryDays <= 0 ? (
                    <span className="text-emerald-400">EXPIRED</span>
                  ) : (
                    <span>{pool.lockExpiryDays} Days Left</span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-bg-darker rounded-full overflow-hidden border border-border-dark">
                <div
                  className={`h-full transition-all duration-500 ${pool.isUnlocked ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.max(0, Math.min(100, ((100 - pool.lockExpiryDays) / 100) * 100))}%` }}
                />
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                The countdown is read from the vault contract itself (<span className="font-mono text-gray-300">lockExpiry</span>).
                No button, key, or admin call can shorten it — early withdrawal reverts with{' '}
                <span className="font-mono text-amber-300">StillLocked()</span>, and after expiry the developer can reclaim{' '}
                <span className="text-white font-semibold">only the original principal</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Security Commitments card */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="text-kaspa w-5 h-5" />
            <h3 className="font-display font-bold text-lg text-white">Transparency Commitments</h3>
          </div>

          <ul className="space-y-3 text-xs text-gray-300 font-sans">
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>Non-custodial</strong>: you sign every trade from your own wallet; margin sits in the vault contract, never with the developer.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>No backdoors</strong>: the vault has no owner sweep or emergency drain. The only outflows are trader payouts and the one-time seed reclaim — both event-logged.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>Manipulation-resistant pricing</strong>: settlement uses the median of independent reporters, and the protocol refuses to trade when fresh sources fall below the floor.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>Capped house edge</strong>: the liquidation profit-share and every fee tier are hard-capped in the contract (10% max) and readable by anyone.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* RIGHT COLUMN: Code Inspector & Deployment Matrix (Col Span 7) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Code Auditing / Source Viewer — real Solidity, verbatim */}
        <div className="bg-bg-dark rounded-xl border border-border-dark shadow-lg overflow-hidden flex flex-col h-full min-h-[450px]">
          <div className="bg-bg-darker border-b border-border-dark px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode className="text-kaspa w-4 h-4" />
              <span className="font-display font-bold text-sm text-white">Deployed Contract Source</span>
            </div>

            <div className="flex items-center gap-1 bg-bg-dark p-0.5 rounded border border-border-dark">
              {([
                { id: 'fees', label: 'KasLevPerps.sol' },
                { id: 'vault', label: 'KasLevVault.sol' },
                { id: 'oracle', label: 'KasLevOracle.sol' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveCodeTab(t.id)}
                  className={`px-2.5 py-1 text-xs rounded transition-all font-mono font-medium cursor-pointer ${
                    activeCodeTab === t.id
                      ? 'bg-kaspa text-bg-darker font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-bg-darker flex-1 overflow-auto max-h-[350px] font-mono text-[11px] leading-relaxed text-gray-300 border-b border-border-dark scrollbar-thin">
            <pre className="whitespace-pre">
              {activeCodeTab === 'fees' && feeModelCode}
              {activeCodeTab === 'vault' && vaultLockCode}
              {activeCodeTab === 'oracle' && oracleCode}
            </pre>
          </div>

          <div className="p-4 bg-bg-dark flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400 font-mono">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Solidity 0.8.24 · OpenZeppelin · 27 passing tests</span>
            </div>
            <span>full sources: contracts/contracts/</span>
          </div>
        </div>

        {/* Deployment matrix — the REAL contract addresses, linked to each explorer */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2.5">
            <Unlock className="text-kaspa w-5 h-5" />
            <h3 className="font-display font-bold text-sm text-white">Smart Contract Deployment Matrix</h3>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            KasLev is deployed on two Kaspa EVM Layer-2 testnets. Every address below is the live
            contract — click through to inspect it on the network's explorer.
          </p>

          <div className="space-y-3">
            {(Object.keys(NETWORKS) as (keyof typeof NETWORKS)[]).map((netKey) => {
              const net = NETWORKS[netKey];
              return (
                <div key={netKey} className="bg-bg-darker p-3 rounded-lg border border-border-dark space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-mono font-bold uppercase tracking-wider">{net.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">chain {net.chainIdDec} · {net.nativeCurrency.symbol}</span>
                  </div>

                  {contractRows.map((row) => (
                    <div key={row.key} className="space-y-0.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-kaspa font-mono">{row.label}</span>
                        <a
                          href={`${net.explorer}/address/${net.contracts[row.key]}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-500 hover:text-kaspa font-mono flex items-center gap-1"
                        >
                          explorer <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-white text-[10px] font-mono select-all bg-bg-dark p-1.5 rounded truncate">
                        {net.contracts[row.key]}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
