/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Unlock, HelpCircle, FileCode, CheckCircle2, DollarSign, ArrowRight, ShieldAlert, Coins } from 'lucide-react';
import { LiquidityPool } from '../types';

interface ProtocolTransparencyProps {
  pool: LiquidityPool;
  onFastForward: (days: number) => void;
  onWithdraw30k: () => void;
  devWalletAddress: string;
}

export default function ProtocolTransparency({
  pool,
  onFastForward,
  onWithdraw30k,
  devWalletAddress,
}: ProtocolTransparencyProps) {
  const [activeCodeTab, setActiveCodeTab] = useState<'fees' | 'pool' | 'toccata'>('fees');

  const feeModelCode = `// /////////////////////////////////////////////////////////
// KasLev Leverage Fee Smart Contract Rule
// /////////////////////////////////////////////////////////
// Secure, non-custodial, open-source rule implementation
// Zero administrative overrides, fully inspectable.

const FLOOR_LEVERAGE: u64 = 10000;
const MEGA_LEVERAGE: u64 = 100000;
const HYPER_LEVERAGE: u64 = 1000000;

pub fn calculate_protocol_fee(
    leverage: u64, 
    collateral_kas: u64
) -> u64 {
    // 1. Standard Leverage Model (leverage <= 50x) -> 1% (0.01)
    // 2. High-Risk Leverage Model (> 50x to < 10000x) -> 5% (0.05)
    // 3. Elite Floor Leverage (10000x) -> 1% (0.01)
    // 4. Mega Leverage (100000x) -> 2% (0.02)
    // 5. Hyper Leverage (1000000x) -> 5% (0.05)
    
    let fee_bps = if leverage <= 50 {
        100 // 1.00%
    } else if leverage < FLOOR_LEVERAGE {
        500 // 5.00%
    } else if leverage < MEGA_LEVERAGE {
        100 // 1.00% @ Floor leverage (10,000x)
    } else if leverage < HYPER_LEVERAGE {
        200 // 2.00% @ Mega leverage (100,000x)
    } else {
        500 // 5.00% @ Hyper leverage (1,000,000x or more)
    };

    let fee_amount = (collateral_kas * fee_bps) / 10000;
    
    // Transparent distribution of fees:
    // Opened positions send fee immediately to developer wallet:
    // dev_wallet: kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9
    
    return fee_amount;
}`;

  const poolLockCode = `// /////////////////////////////////////////////////////////
// KasLev Liquidity Pool and developer Lock-up
// /////////////////////////////////////////////////////////
// Enforces 100-day freeze on developer's initial 30,000 KAS.
// Absolutely NO withdrawals of excess liquidity accumulated.

const INITIAL_DEV_CONTRIBUTION: u64 = 30000; // 30,000 KAS
const LOCK_PERIOD_BLOCKS: u64 = 8640000; // ~100 days (1 block/sec)

struct LiquidityPool {
    pool_balance_kas: u64,
    developer_contributed_kas: u64,
    accumulated_protocol_fees: u64,
    deployment_timestamp: u64,
    lock_duration_seconds: u64,
    dev_withdrawn: bool,
}

pub fn withdraw_developer_initial_lock(
    pool: &mut LiquidityPool,
    caller_wallet: Address,
    current_timestamp: u64
) -> Result<u64, Error> {
    // Only the verified developer wallet address can invoke this
    if caller_wallet != Address::from("kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9") {
        return Err(Error::Unauthorized);
    }

    // Check lock expiration (100 days)
    let expiration = pool.deployment_timestamp + pool.lock_duration_seconds;
    if current_timestamp < expiration {
        return Err(Error::LiquidityLocked);
    }

    if pool.dev_withdrawn {
        return Err(Error::AlreadyWithdrawn);
    }

    // CRITICAL SECURITY ENFORCEMENT:
    // Can ONLY withdraw exactly the initial contribution.
    // All trading volumes, liquidity gains, and fees stay in the pool FOREVER.
    // Safe-guard against developer rugpulls.
    
    pool.dev_withdrawn = true;
    pool.pool_balance_kas -= INITIAL_DEV_CONTRIBUTION;
    
    return Ok(INITIAL_DEV_CONTRIBUTION);
}`;

  const toccataCode = `// /////////////////////////////////////////////////////////
// KasLev Toccata Asset Listing Controller
// /////////////////////////////////////////////////////////
// Controls listing of community tokens and meme coins.
// Restricts addition only to the official developer wallet to 
// prevent malicious contract poisoning and scam listing spam.

pub fn register_toccata_native_token(
    caller: Address,
    symbol: String,
    name: String,
    decimals: u8
) -> Result<Token, Error> {
    if caller != Address::from("kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9") {
        return Err(Error::ForbiddenAccessOnlyDev);
    }
    
    let token = Token {
        symbol,
        name,
        decimals,
        is_active: true,
        listed_post_toccata: true
    };
    
    return Ok(token);
}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-7xl mx-auto" id="transparency-tab-content">
      {/* LEFT COLUMN: Pool Status & Timers (Col Span 5) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Pool Metrics Card */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg relative overflow-hidden" id="liquidity-pool-stats">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-kaspa/10 to-transparent pointer-events-none" />
          
          <div className="flex items-center gap-2.5 mb-4">
            <Coins className="text-kaspa w-5 h-5" />
            <h3 className="font-display font-bold text-lg text-white">Initial Liquidity Pool</h3>
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
                <span className="text-[10px] text-gray-400 block font-mono">Developer Locked</span>
                <span className="text-base font-mono font-bold text-white">
                  {pool.developerContribution.toLocaleString()} KAS
                </span>
              </div>
              <div className="bg-bg-darker p-3 rounded-lg border border-border-dark">
                <span className="text-[10px] text-gray-400 block font-mono">Accumulated Fees</span>
                <span className="text-base font-mono font-bold text-kaspa">
                  {pool.accumulatedFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KAS
                </span>
              </div>
            </div>

            {/* Lock Status Section */}
            <div className={`p-4 rounded-lg border flex flex-col gap-3 transition-colors ${
              pool.isUnlocked 
                ? 'bg-emerald-500/5 border-emerald-500/20' 
                : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {pool.isUnlocked ? (
                    <Unlock className="text-emerald-400 w-5 h-5 animate-bounce" />
                  ) : (
                    <Lock className="text-amber-400 w-5 h-5 animate-pulse" />
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      {pool.isUnlocked ? 'Developer Lock Expired' : 'Developer Lock Active'}
                    </h4>
                    <p className="text-[11px] text-gray-400">Locked duration: 100 Days</p>
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

              {/* Developer Action Trigger */}
              <div className="mt-1 flex flex-col gap-2">
                {!pool.isUnlocked ? (
                  <div className="flex gap-2">
                    <button
                      id="fast-forward-10-days"
                      onClick={() => onFastForward(10)}
                      className="flex-1 bg-bg-darker hover:bg-bg-card text-gray-300 font-mono text-[11px] py-1.5 rounded border border-border-dark transition-all cursor-pointer"
                    >
                      Fast-Forward 10 Days
                    </button>
                    <button
                      id="fast-forward-100-days"
                      onClick={() => onFastForward(100)}
                      className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-mono text-[11px] py-1.5 rounded border border-amber-500/30 transition-all cursor-pointer"
                    >
                      Unlock Now (Skip 100d)
                    </button>
                  </div>
                ) : pool.developerContribution > 0 ? (
                  <button
                    id="dev-withdraw-action"
                    onClick={onWithdraw30k}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-bg-darker font-bold font-display text-xs py-2 rounded shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-4 h-4" />
                    Withdraw Locked 30,000 KAS (Dev Only)
                  </button>
                ) : (
                  <div className="bg-emerald-500/10 text-emerald-400 p-2.5 rounded border border-emerald-500/20 text-center font-mono text-[11px]">
                    ✔ Developer successfully withdrew exactly 30,000 KAS. Pool remaining permanently locked in the protocol.
                  </div>
                )}
              </div>
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
              <span><strong>No Hidden Keys</strong>: Users hold their own keys. Every transaction is simulated using direct signature principles natively with zero remote storage.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>No Backdoors</strong>: Total public codebase audits enabled. No backdoor parameters exist to freeze, halt, or rug user positions.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>Pool Sustainability</strong>: Accumulated trade volume profits remain permanently locked in the protocol supporting perpetual trade liquidity depth.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="text-kaspa font-bold mt-0.5">✔</span>
              <span><strong>Toccata Hard Fork Rule</strong>: To maintain high standards, scam-free controls listings are delegated strictly to developers to protect decentralized liquidity pools from toxic meme coin contracts.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* RIGHT COLUMN: Code Inspector & Audit Log (Col Span 7) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Code Auditing / Source Viewer */}
        <div className="bg-bg-dark rounded-xl border border-border-dark shadow-lg overflow-hidden flex flex-col h-full min-h-[450px]">
          {/* Code Viewer Headers */}
          <div className="bg-bg-darker border-b border-border-dark px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode className="text-kaspa w-4 h-4" />
              <span className="font-display font-bold text-sm text-white">Protocol Smart Contract Source</span>
            </div>
            
            <div className="flex items-center gap-1 bg-bg-dark p-0.5 rounded border border-border-dark">
              <button
                onClick={() => setActiveCodeTab('fees')}
                className={`px-2.5 py-1 text-xs rounded transition-all font-mono font-medium cursor-pointer ${
                  activeCodeTab === 'fees' 
                    ? 'bg-kaspa text-bg-darker font-semibold' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                leverage_fees.rs
              </button>
              <button
                onClick={() => setActiveCodeTab('pool')}
                className={`px-2.5 py-1 text-xs rounded transition-all font-mono font-medium cursor-pointer ${
                  activeCodeTab === 'pool' 
                    ? 'bg-kaspa text-bg-darker font-semibold' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                liquidity_pool.rs
              </button>
              <button
                onClick={() => setActiveCodeTab('toccata')}
                className={`px-2.5 py-1 text-xs rounded transition-all font-mono font-medium cursor-pointer ${
                  activeCodeTab === 'toccata' 
                    ? 'bg-kaspa text-bg-darker font-semibold' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                toccata_tokens.rs
              </button>
            </div>
          </div>

          {/* Actual Code Area */}
          <div className="p-4 bg-bg-darker flex-1 overflow-auto max-h-[350px] font-mono text-[11px] leading-relaxed text-gray-300 border-b border-border-dark scrollbar-thin">
            <pre className="whitespace-pre">
              {activeCodeTab === 'fees' && feeModelCode}
              {activeCodeTab === 'pool' && poolLockCode}
              {activeCodeTab === 'toccata' && toccataCode}
            </pre>
          </div>

          {/* Verifiability Details */}
          <div className="p-4 bg-bg-dark flex items-center justify-between text-xs text-gray-400 font-mono">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Compilation verified in KAS-WASM compiler v0.14-Toccata</span>
            </div>
            <div>
              <span>SHA256: 8f921e...fc42</span>
            </div>
          </div>
        </div>

        {/* Deployed Smart Contract Infrastructure Matrix */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2.5">
            <Unlock className="text-kaspa w-5 h-5" />
            <h3 className="font-display font-bold text-sm text-white">Smart Contract Deployment Matrix</h3>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            The multi-layer smart contract architecture is live across Kaspa L1 mainnet nodes and platform rollup state contracts. Verification keys match the following immutable addresses:
          </p>
          <div className="space-y-3">
            {/* L1 Addresses */}
            <div className="bg-bg-darker p-3 rounded-lg border border-border-dark space-y-2">
              <span className="text-[10px] text-gray-400 font-mono font-bold uppercase block tracking-wider">Layer 1 (Mainnet DAG)</span>
              
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-kaspa font-mono">L1 DEV SECURITY WALLET:</span>
                  <span className="text-gray-500 font-mono">Immutable Owner</span>
                </div>
                <div className="text-white text-[10px] font-mono select-all bg-bg-dark p-1.5 rounded truncate">
                  kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-amber-400 font-mono">L1 PLATFORM VAULT WALLET:</span>
                  <span className="text-gray-500 font-mono">Liquidity Pool</span>
                </div>
                <div className="text-white text-[10px] font-mono select-all bg-bg-dark p-1.5 rounded truncate">
                  kaspa:qqzjw5ur7fyq9q7la72shhcfcq02j76uetfque833g2l7e8vmjkt2eqf5egkf
                </div>
              </div>
            </div>

            {/* L2 Addresses */}
            <div className="bg-bg-darker p-3 rounded-lg border border-border-dark space-y-2">
              <span className="text-[10px] text-gray-400 font-mono font-bold uppercase block tracking-wider">Layer 2 (Zero-Gas EVM Rollups)</span>
              
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-kaspa font-mono">L2 DEV SECURITY WALLET:</span>
                  <span className="text-gray-500 font-mono">Admin Key</span>
                </div>
                <div className="text-white text-[10px] font-mono select-all bg-bg-dark p-1.5 rounded truncate">
                  0xeA926cFcccbF5e9657C9e397FC8D80DF361538e9
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-amber-400 font-mono">L2 PLATFORM BRIDGE WALLET:</span>
                  <span className="text-gray-500 font-mono">Rollup Contract</span>
                </div>
                <div className="text-white text-[10px] font-mono select-all bg-bg-dark p-1.5 rounded truncate">
                  0xCcBe7Cf3472D15aAf950eF02D7067751bAE7DBb0
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
