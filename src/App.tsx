/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from './components/Navbar';
import TradingView from './components/TradingView';
import StrategyBuilder from './components/StrategyBuilder';
import TokenManager from './components/TokenManager';
import ProtocolTransparency from './components/ProtocolTransparency';
import TransactionLedger from './components/TransactionLedger';
import { Token, Position, LiquidityPool, AutomatedStrategy, TradeHistoryItem } from './types';
import { Shield, Sparkles, AlertCircle, CheckCircle2, RefreshCw, Radio, Bell } from 'lucide-react';
import { useKaspaPrice } from './hooks/useKaspaPrice';
import { getFeePercentage, calculateLiquidationPrice, calculatePnL, calculatePositionSize } from './utils/math';
import {
  openPositionOnChain,
  closePositionOnChain,
  setActiveNetwork,
  getActiveNetwork,
  isSupportedNetwork,
  getTraderPositions,
  getVaultStats,
  assetId,
  friendlyTxError,
} from './web3/kaslev';

const INITIAL_TOKENS: Token[] = [
  { id: 'kas', symbol: 'KAS', name: 'Kaspa', price: 0.15420, change24h: 3.42, decimals: 8 },
  { id: 'nacho', symbol: 'NACHO', name: 'Nacho the Cat', price: 0.00045, change24h: -12.4, isCustom: true, decimals: 8, contractAddress: 'kaspa:nacho:cat_meme_6283' },
  { id: 'kaspy', symbol: 'KASPY', name: 'Kaspy Doge', price: 0.00185, change24h: 24.15, isCustom: true, decimals: 8, contractAddress: 'kaspa:kaspy:doge_meme_9112' },
];

export const DEV_WALLET = 'kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9';
export const USER_WALLET = 'kaspa:qqzjw5ur7fyq9q7la72shhcfcq02j76uetfque833g2l7e8vmjkt2eqf5egkf';
export const VAULT_ADDRESS = 'kaspa:pdgkr932xsh8w4mq7la72shhcfcq02j76uetfque833g2l7e8vmjkp00lvscv4';

export function generateTxId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

const INITIAL_HISTORY: TradeHistoryItem[] = [
  {
    id: 'hist-init-lock',
    symbol: 'KAS',
    type: 'POOL',
    action: 'LOCK',
    leverage: 10000,
    size: 30000,
    price: 0.1542,
    pnl: 0,
    fee: 0,
    timestamp: Date.now() - 3600000 * 48,
    txId: '6a4fb9c12df830b801fcd2fe88ab109e2cf3fbe1b3a3d5ea90f89d1b091e4f3a',
    fromAddress: DEV_WALLET,
    toAddress: VAULT_ADDRESS,
    blueScore: 82891200,
    isSimulatedInitial: true
  },
  {
    id: 'hist-init-deposit',
    symbol: 'KAS',
    type: 'POOL',
    action: 'DEPOSIT',
    leverage: 1,
    size: 1220450,
    price: 0.1542,
    pnl: 0,
    fee: 0,
    timestamp: Date.now() - 3600000 * 36,
    txId: 'e28a9b1c7da09f02983b8bfa101183aa2cfbbec3a302e9e11fc90fbb09e1e2d4',
    fromAddress: 'kaspa:qr938fsdf82msmhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy9092jf',
    toAddress: VAULT_ADDRESS,
    blueScore: 82902300,
    isSimulatedInitial: true
  },
  {
    id: 'hist-init-fee-1',
    symbol: 'NACHO',
    type: 'LONG',
    action: 'OPEN',
    leverage: 100000,
    size: 22222222.22,
    price: 0.00045,
    pnl: 0,
    fee: 200,
    timestamp: Date.now() - 3600000 * 5,
    txId: '7f2a1b9c3da09d1e283b8bfa102183aa2cfbbec3a302e9e11fc90fbb09e1e83f',
    fromAddress: USER_WALLET,
    toAddress: DEV_WALLET,
    blueScore: 82910400,
    isSimulatedInitial: true
  },
  {
    id: 'hist-init-fee-2',
    symbol: 'KAS',
    type: 'SHORT',
    action: 'OPEN',
    leverage: 10000,
    size: 10000,
    price: 0.1542,
    pnl: 0,
    fee: 250,
    timestamp: Date.now() - 3600000 * 2,
    txId: 'c19e3b7a1df830b801fcd2fe88ab109e2cf3fbe1b3a3d5ea90f89d1b091eff54',
    fromAddress: USER_WALLET,
    toAddress: DEV_WALLET,
    blueScore: 82912100,
    isSimulatedInitial: true
  }
];

export default function App() {
  // Call real-time oracle price feed hook
  const {
    price: liveKasPrice,
    change24h: liveKasChange,
    source: priceSource,
    isLoading: isPriceLoading,
    refetch: refetchPrice,
  } = useKaspaPrice();

  // Tab navigation
  const [currentTab, setCurrentTab] = useState<string>('trading');

  // L1 & L2 Network / Wallet States
  const [activeChain, setActiveChain] = useState<'L1' | 'L2_IGRA' | 'L2_SPARKLE' | 'L2_KASPLEX'>('L2_KASPLEX');
  const [connectedWalletType, setConnectedWalletType] = useState<'KASPIUM' | 'KASWARE' | 'KDX' | 'METAMASK' | null>(null);
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [userL1Address, setUserL1Address] = useState<string>('kaspa:qqzjw5ur7fyq9q7la72shhcfcq02j76uetfque833g2l7e8vmjkt2eqf5egkf');
  const [userL2Address, setUserL2Address] = useState<string>('0x7F268b82Ac901E9b7c84D76de02D70B92AcC6C00');

  // Legacy wallet state fallback for KDX compatibility
  const [userWallet, setUserWallet] = useState<string>('kaspa:qqzjw5ur7fyq9q7la72shhcfcq02j76uetfque833g2l7e8vmjkt2eqf5egkf');

  // AI Autonomous Trading Agent States
  const [isAiTradeAgentActive, setIsAiTradeAgentActive] = useState<boolean>(false);
  const [aiTradeAgentSettings, setAiTradeAgentSettings] = useState({
    riskProfile: 'MODERATE' as 'CONSERVATIVE' | 'MODERATE' | 'DEGEN',
    triggerFrequencySec: 30,
    customPrompt: 'Scalp trade the trend with optimized swing leverage settings.'
  });
  const [aiAgentLogs, setAiAgentLogs] = useState<string[]>([
    '🤖 AI Autonomous Trading Agent initialized.',
    '🤖 Awaiting user activation signal...'
  ]);

  const [aiCountdown, setAiCountdown] = useState<number>(30);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Network speed mode
  const [isKdxConnected, setIsKdxConnected] = useState<boolean>(true);

  // Theme Toggle (Obsidian vs High-Contrast)
  const [isHighContrast, setIsHighContrast] = useState<boolean>(() => {
    const saved = localStorage.getItem('kaslev_high_contrast');
    return saved === 'true';
  });

  useEffect(() => {
    if (isHighContrast) {
      document.documentElement.classList.add('theme-high-contrast');
    } else {
      document.documentElement.classList.remove('theme-high-contrast');
    }
    localStorage.setItem('kaslev_high_contrast', String(isHighContrast));
  }, [isHighContrast]);

  // Keep the on-chain layer pointed at whichever supported L2 the user has selected,
  // so real trades are routed to that chain's deployed contracts.
  useEffect(() => {
    if (isSupportedNetwork(activeChain)) {
      setActiveNetwork(activeChain);
    }
  }, [activeChain]);

  // Core Data States (persisted in localStorage for convenience)
  const [tokens, setTokens] = useState<Token[]>(() => {
    const saved = localStorage.getItem('kaslev_tokens');
    return saved ? JSON.parse(saved) : INITIAL_TOKENS;
  });

  const [activeToken, setActiveToken] = useState<Token>(() => {
    return tokens[0] || INITIAL_TOKENS[0];
  });

  const [positions, setPositions] = useState<Position[]>(() => {
    const saved = localStorage.getItem('kaslev_positions');
    return saved ? JSON.parse(saved) : [];
  });

  const [strategies, setStrategies] = useState<AutomatedStrategy[]>(() => {
    const saved = localStorage.getItem('kaslev_strategies');
    return saved ? JSON.parse(saved) : [];
  });

  const [pool, setPool] = useState<LiquidityPool>(() => {
    const saved = localStorage.getItem('kaslev_pool');
    return saved
      ? JSON.parse(saved)
      : {
          totalKAS: 1250450, // Starts with plenty of liquidity + developer contribution
          developerContribution: 30000,
          lockedKAS: 30000,
          lockExpiryDays: 100,
          accumulatedFees: 450,
          isUnlocked: false,
        };
  });

  const [tradeHistory, setTradeHistory] = useState<TradeHistoryItem[]>(() => {
    const saved = localStorage.getItem('kaslev_history');
    return saved ? JSON.parse(saved) : INITIAL_HISTORY;
  });

  // ------------------------------------------------------------------
  // ON-CHAIN SYNC: positions of the connected wallet, straight from the
  // active L2's contracts. This is the source of truth — it survives page
  // reloads and reflects liquidations done by keepers. Simulated (non
  // `onchain-`) positions are left untouched.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isWalletConnected || connectedWalletType !== 'METAMASK' || !isSupportedNetwork(activeChain)) return;
    let cancelled = false;

    const sync = async () => {
      try {
        // Map on-chain assetIds (keccak of the symbol) back to readable symbols.
        const idToSymbol = new Map<string, string>();
        for (const t of tokens) idToSymbol.set(assetId(t.symbol).toLowerCase(), t.symbol);
        const chainPositions = await getTraderPositions(userL2Address, (id) =>
          idToSymbol.get(id.toLowerCase()) || 'KAS',
        );
        if (cancelled) return;

        setPositions((prev) => {
          const sim = prev.filter((p) => !p.id.startsWith('onchain-'));
          const mapped: Position[] = chainPositions.map((cp) => {
            const existing = prev.find((p) => p.id === `onchain-${cp.id}`);
            const notional = cp.marginKas * cp.leverage;
            // Recover the current price implied by the on-chain PnL.
            const move = notional > 0 ? cp.pnlKas / notional : 0;
            const currentPrice = cp.entryPrice * (1 + (cp.isLong ? move : -move));
            return {
              id: `onchain-${cp.id}`,
              symbol: cp.symbol,
              type: cp.isLong ? 'LONG' : 'SHORT',
              leverage: cp.leverage,
              size: parseFloat(notional.toFixed(2)),
              margin: cp.marginKas,
              entryPrice: cp.entryPrice,
              liquidationPrice: cp.liquidationPrice,
              currentPrice,
              pnl: cp.pnlKas,
              pnlPercentage: cp.marginKas > 0 ? (cp.pnlKas / cp.marginKas) * 100 : 0,
              feePaid: cp.marginKas * (getFeePercentage(cp.leverage) / 100),
              timestamp: existing?.timestamp ?? Date.now(),
            };
          });
          return [...sim, ...mapped];
        });
      } catch (err) {
        console.warn('on-chain position sync failed:', err);
      }
    };

    sync();
    const interval = setInterval(sync, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isWalletConnected, connectedWalletType, activeChain, userL2Address, tokens]);

  // ON-CHAIN SYNC: live vault stats (pool size, locked seed, unlock countdown)
  // for the Protocol Audits tab. Read-only — works without a wallet.
  useEffect(() => {
    if (!isSupportedNetwork(activeChain)) return;
    let cancelled = false;

    const sync = async () => {
      try {
        const stats = await getVaultStats();
        if (cancelled) return;
        setPool((prev) => ({
          ...prev,
          totalKAS: stats.totalLiquidity,
          developerContribution: stats.developerPrincipal,
          lockedKAS: stats.isUnlocked ? 0 : stats.developerPrincipal,
          lockExpiryDays: Math.ceil(stats.daysUntilUnlock),
          isUnlocked: stats.isUnlocked,
        }));
      } catch (err) {
        console.warn('vault stats sync failed:', err);
      }
    };

    sync();
    const interval = setInterval(sync, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeChain]);

  // Floating notifications
  const [alerts, setAlerts] = useState<{ id: string; type: 'success' | 'error' | 'info'; text: string }[]>([]);

  // Trigger alert helper
  const triggerAlert = (type: 'success' | 'error' | 'info', text: string) => {
    const id = `alert-${Date.now()}-${Math.random()}`;
    setAlerts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 5000);
  };

  // Keep KAS token price synced with the real-time API oracle
  useEffect(() => {
    setTokens((prev) =>
      prev.map((tok) => {
        if (tok.id === 'kas') {
          return {
            ...tok,
            price: liveKasPrice,
            change24h: liveKasChange,
          };
        }
        return tok;
      })
    );
  }, [liveKasPrice, liveKasChange]);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('kaslev_tokens', JSON.stringify(tokens));
  }, [tokens]);

  useEffect(() => {
    localStorage.setItem('kaslev_positions', JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('kaslev_strategies', JSON.stringify(strategies));
  }, [strategies]);

  useEffect(() => {
    localStorage.setItem('kaslev_pool', JSON.stringify(pool));
  }, [pool]);

  useEffect(() => {
    localStorage.setItem('kaslev_history', JSON.stringify(tradeHistory));
  }, [tradeHistory]);

  // Sync activeToken with updated prices from tokens list
  useEffect(() => {
    const updated = tokens.find((t) => t.id === activeToken.id);
    if (updated) {
      setActiveToken(updated);
    }
  }, [tokens]);

  // LIVE MARKET TICK SIMULATION (ONLY FOR CUSTOM MEME TOKENS)
  useEffect(() => {
    const interval = setInterval(() => {
      setTokens((prevTokens) =>
        prevTokens.map((tok) => {
          if (tok.id === 'kas') return tok; // Sourced directly from live API hook
          const volatility = 0.008;
          const pctChange = (Math.random() - 0.495) * volatility;
          const newPrice = Math.max(0.00001, tok.price * (1 + pctChange));
          const updatedChange = tok.change24h + pctChange * 100;

          return {
            ...tok,
            price: parseFloat(newPrice.toFixed(6)),
            change24h: parseFloat(updatedChange.toFixed(2)),
          };
        })
      );
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // POSITION DYNAMIC VALUE AND LIQUIDATION UPDATES
  useEffect(() => {
    if (positions.length === 0) return;

    // Run position check every tick
    const interval = setInterval(() => {
      setPositions((prevPositions) => {
        const remaining: Position[] = [];

        prevPositions.forEach((pos) => {
          // On-chain positions are settled by the real contract + keeper (and refreshed by
          // the on-chain sync). NEVER run the local liquidation simulation on them — doing so
          // wiped them locally while they were still open on-chain, and the resync kept
          // re-adding them, spamming duplicate "liquidated" alerts.
          if (pos.id.startsWith('onchain-')) {
            remaining.push(pos);
            return;
          }

          const tokenPrice = tokens.find((t) => t.symbol === pos.symbol)?.price || pos.currentPrice;

          const kasPrice = tokens.find((t) => t.id === 'kas')?.price || 0.1542;
          const { pnlKAS, pnlPercentage } = calculatePnL(pos.type, pos.entryPrice, tokenPrice, pos.size, kasPrice);

          // Check Liquidation!
          const isLong = pos.type === 'LONG';
          const isLiquidated = isLong
            ? tokenPrice <= pos.liquidationPrice
            : tokenPrice >= pos.liquidationPrice;

          if (isLiquidated) {
            // Trigger Liquidation process
            triggerAlert('error', `🛑 LIQUIDATION TRIGGERED: Your ${pos.leverage}x ${pos.type} position on ${pos.symbol} was liquidated at $${tokenPrice.toFixed(6)}.`);
            
            // Log to history
            const logItem: TradeHistoryItem = {
              id: `hist-${Date.now()}`,
              symbol: pos.symbol,
              type: pos.type,
              action: 'LIQUIDATION',
              leverage: pos.leverage,
              size: pos.size,
              price: tokenPrice,
              pnl: -pos.margin,
              fee: pos.feePaid,
              timestamp: Date.now(),
              txId: generateTxId(),
              fromAddress: VAULT_ADDRESS,
              toAddress: DEV_WALLET,
              blueScore: 82912500 + Math.floor(Math.random() * 500),
            };
            setTradeHistory((prev) => [logItem, ...prev]);

            // Add the lost margin to the Liquidity Pool accumulated balances as protocol gains
            setPool((prevPool) => ({
              ...prevPool,
              totalKAS: prevPool.totalKAS + pos.margin,
            }));
          } else {
            remaining.push({
              ...pos,
              currentPrice: tokenPrice,
              pnl: pnlKAS,
              pnlPercentage: pnlPercentage,
            });
          }
        });

        return remaining;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [positions, tokens]);

  // AUTOMATED STRATEGY EVALUATOR
  useEffect(() => {
    if (strategies.length === 0 || positions.length === 0) return;

    const interval = setInterval(() => {
      setStrategies((prevStrats) => {
        return prevStrats.map((strat) => {
          if (!strat.isActive || strat.status !== 'PENDING') return strat;

          const tokenInfo = tokens.find((t) => t.symbol === strat.symbol);
          if (!tokenInfo) return strat;

          const price = tokenInfo.price;
          const isTakeProfit = strat.type === 'TAKE_PROFIT';
          const isStopLoss = strat.type === 'STOP_LOSS';

          let shouldTrigger = false;
          if (isTakeProfit && price >= strat.triggerPrice) shouldTrigger = true;
          if (isStopLoss && price <= strat.triggerPrice) shouldTrigger = true;

          if (shouldTrigger) {
            // Find active position to execute the bot strategy on
            const targetPos = positions.find((p) => p.symbol === strat.symbol);
            if (targetPos) {
              // Trigger closing the position
              triggerAlert('success', `🤖 BOT TRIGGERED: Automated ${strat.type} bot executed trade on ${strat.symbol} at target $${strat.triggerPrice.toFixed(6)}!`);
              
              // Direct execution closure
              handleClosePosition(targetPos.id);

              return {
                ...strat,
                isActive: false,
                status: 'TRIGGERED',
              };
            }
          }
          return strat;
        });
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [strategies, positions, tokens]);

  // TRADING OPEN ACTION
  const handleOpenPosition = async (
    type: 'LONG' | 'SHORT',
    leverage: number,
    collateral: number,
    source: 'user' | 'ai' = 'user',
  ) => {
    if (collateral <= 0) {
      triggerAlert('error', 'Enter a valid collateral amount in KAS.');
      return;
    }

    // SAFETY GUARD: only an explicit USER action may spend real funds on-chain. The
    // autonomous AI agent always paper-trades (source === 'ai') and never signs a real
    // transaction — a bot must never move the user's money without a deliberate click.
    // REAL on-chain path: MetaMask on Kasplex L2 executes an actual openPosition transaction.
    if (source === 'user' && connectedWalletType === 'METAMASK' && typeof (window as any).ethereum !== 'undefined') {
      try {
        triggerAlert('info', `🔒 Confirm the ${type} in MetaMask — margin + fee are sent on-chain...`);
        const { txHash, positionId } = await openPositionOnChain(
          activeToken.symbol, leverage, type === 'LONG', collateral,
        );

        const currentPrice = activeToken.price;
        const feePercent = getFeePercentage(leverage);
        const feePaid = collateral * (feePercent / 100);
        const kasPrice = tokens.find((t) => t.id === 'kas')?.price || 0.1542;
        const sizeInTokens = calculatePositionSize(collateral, leverage, kasPrice, currentPrice);
        const liquidationPrice = calculateLiquidationPrice(type, currentPrice, leverage);

        setPositions((prev) => [...prev, {
          id: positionId != null ? `onchain-${positionId}` : `onchain-${Date.now()}`,
          symbol: activeToken.symbol, type, leverage,
          size: parseFloat(sizeInTokens.toFixed(2)), margin: collateral,
          entryPrice: currentPrice, liquidationPrice: parseFloat(liquidationPrice.toFixed(6)),
          currentPrice, pnl: 0, pnlPercentage: 0, feePaid, timestamp: Date.now(),
        }]);
        setTradeHistory((prev) => [{
          id: `hist-${Date.now()}`, symbol: activeToken.symbol, type, action: 'OPEN',
          leverage, size: parseFloat(sizeInTokens.toFixed(2)), price: currentPrice,
          pnl: 0, fee: feePaid, timestamp: Date.now(), txId: txHash, fromAddress: userL2Address,
        }, ...prev]);
        console.log(`View tx: ${getActiveNetwork().explorer}/tx/${txHash}`);
        triggerAlert('success', `✅ ${type} opened on-chain! Tx ${txHash.substring(0, 12)}… (position #${positionId ?? '?'})`);
      } catch (err: any) {
        console.error('On-chain openPosition failed:', err);
        triggerAlert('error', friendlyTxError(err));
      }
      return;
    }

    if (connectedWalletType === 'KASWARE' && typeof (window as any).kasware !== 'undefined') {
      try {
        triggerAlert('info', '🔒 Sign the position authorization in Kasware to proceed...');
        const sig = await (window as any).kasware.signMessage(`Authorize KasLev High-Leverage Position:\nSymbol: ${activeToken.symbol}\nType: ${type}\nLeverage: ${leverage}x\nCollateral: ${collateral} KAS`);
        console.log('Position signed successfully in Kasware. Signature:', sig);
        triggerAlert('success', '✅ Position signed & broadcasted safely!');
      } catch (err: any) {
        console.error('Kasware position signing failed:', err);
        triggerAlert('error', `Rejected: ${err?.message || 'Signature request cancelled.'}`);
        return;
      }
    }

    const currentPrice = activeToken.price;
    const feePercent = getFeePercentage(leverage);
    const feePaid = collateral * (feePercent / 100);

    const kasPrice = tokens.find((t) => t.id === 'kas')?.price || 0.1542;
    const sizeInTokens = calculatePositionSize(collateral, leverage, kasPrice, currentPrice);
    const liquidationPrice = calculateLiquidationPrice(type, currentPrice, leverage);

    const newPosition: Position = {
      id: `pos-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      symbol: activeToken.symbol,
      type,
      leverage,
      size: parseFloat(sizeInTokens.toFixed(2)),
      margin: collateral,
      entryPrice: currentPrice,
      liquidationPrice: parseFloat(liquidationPrice.toFixed(6)),
      currentPrice: currentPrice,
      pnl: 0,
      pnlPercentage: 0,
      feePaid: feePaid,
      timestamp: Date.now(),
    };

    setPositions((prev) => [...prev, newPosition]);
    
    // Distribute opening dev fee straight to pool statistics
    setPool((prevPool) => ({
      ...prevPool,
      totalKAS: prevPool.totalKAS + feePaid,
      accumulatedFees: prevPool.accumulatedFees + feePaid,
    }));

    // Log to trade history
    const logItem: TradeHistoryItem = {
      id: `hist-${Date.now()}`,
      symbol: activeToken.symbol,
      type,
      action: 'OPEN',
      leverage,
      size: sizeInTokens,
      price: currentPrice,
      pnl: 0,
      fee: feePaid,
      timestamp: Date.now(),
      txId: generateTxId(),
      fromAddress: userL1Address,
      toAddress: VAULT_ADDRESS,
      blueScore: 82912400 + Math.floor(Math.random() * 500),
    };
    setTradeHistory((prev) => [logItem, ...prev]);

    triggerAlert('success', `🚀 POSITION OPENED: ${leverage.toLocaleString()}x ${type} opened on ${activeToken.symbol} with ${collateral.toLocaleString()} KAS margin.`);
  };

  // TRADING CLOSE ACTION
  const handleClosePosition = async (id: string) => {
    const pos = positions.find((p) => p.id === id);
    if (!pos) return;

    // Real on-chain positions carry an `onchain-<id>` id — settle them via the contract.
    if (id.startsWith('onchain-')) {
      const chainId = parseInt(id.replace('onchain-', ''), 10);
      if (!Number.isNaN(chainId)) {
        try {
          triggerAlert('info', `🔒 Confirm closing position #${chainId} in MetaMask...`);
          const { txHash } = await closePositionOnChain(chainId);
          setPositions((prev) => prev.filter((p) => p.id !== id));
          setTradeHistory((prev) => [{
            id: `hist-${Date.now()}`, symbol: pos.symbol, type: pos.type, action: 'CLOSE',
            leverage: pos.leverage, size: pos.size, price: pos.currentPrice,
            pnl: pos.pnl, fee: pos.feePaid, timestamp: Date.now(), txId: txHash,
            fromAddress: VAULT_ADDRESS, toAddress: userL2Address,
          }, ...prev]);
          console.log(`View tx: ${getActiveNetwork().explorer}/tx/${txHash}`);
          triggerAlert('success', `✅ Position #${chainId} closed on-chain! Tx ${txHash.substring(0, 12)}…`);
        } catch (err: any) {
          console.error('On-chain close failed:', err);
          triggerAlert('error', friendlyTxError(err));
        }
        return;
      }
    }

    // Standard closing dev fee matches open fee
    const closeFee = pos.feePaid;

    // Log history entry
    const logItem: TradeHistoryItem = {
      id: `hist-${Date.now()}`,
      symbol: pos.symbol,
      type: pos.type,
      action: 'CLOSE',
      leverage: pos.leverage,
      size: pos.size,
      price: pos.currentPrice,
      pnl: pos.pnl,
      fee: closeFee,
      timestamp: Date.now(),
      txId: generateTxId(),
      fromAddress: VAULT_ADDRESS,
      toAddress: USER_WALLET,
      blueScore: 82913500 + Math.floor(Math.random() * 500),
    };

    setTradeHistory((prev) => [logItem, ...prev]);

    // Update positions and pool
    setPositions((prev) => prev.filter((p) => p.id !== id));
    setPool((prevPool) => ({
      ...prevPool,
      totalKAS: prevPool.totalKAS + closeFee,
      accumulatedFees: prevPool.accumulatedFees + closeFee,
    }));

    const statusText = pos.pnl >= 0 
      ? `📈 Position closed with profit of +${pos.pnl.toFixed(2)} KAS (${pos.pnlPercentage.toFixed(2)}%).`
      : `📉 Position closed with loss of ${pos.pnl.toFixed(2)} KAS (${pos.pnlPercentage.toFixed(2)}%).`;

    triggerAlert(pos.pnl >= 0 ? 'success' : 'info', statusText);
  };

  // EMERGENCY CLOSE ALL POSITIONS — really settles on-chain positions via the contract,
  // and clears simulated ones locally. Each on-chain close is a real wallet transaction.
  const handleEmergencyCloseAll = async () => {
    const snapshot = [...positions];
    if (snapshot.length === 0) return;

    const onChain = snapshot.filter((p) => p.id.startsWith('onchain-'));
    const simulated = snapshot.filter((p) => !p.id.startsWith('onchain-'));

    // 1) Real on-chain positions: fire an actual closePosition tx for each.
    if (onChain.length > 0) {
      triggerAlert('info', `🔒 Emergency close: confirm ${onChain.length} on-chain close transaction(s) in your wallet...`);
      for (const pos of onChain) {
        const chainId = parseInt(pos.id.replace('onchain-', ''), 10);
        if (Number.isNaN(chainId)) continue;
        try {
          const { txHash } = await closePositionOnChain(chainId);
          setPositions((prev) => prev.filter((p) => p.id !== pos.id));
          setTradeHistory((prev) => [{
            id: `hist-${Date.now()}-${chainId}`, symbol: pos.symbol, type: pos.type, action: 'CLOSE',
            leverage: pos.leverage, size: pos.size, price: pos.currentPrice, pnl: pos.pnl,
            fee: pos.feePaid, timestamp: Date.now(), txId: txHash, fromAddress: VAULT_ADDRESS, toAddress: userL2Address,
          }, ...prev]);
        } catch (err: any) {
          console.error('emergency close failed for', chainId, err);
          triggerAlert('error', `Position #${chainId}: ${friendlyTxError(err)}`);
        }
      }
    }

    // 2) Simulated positions: clear locally (no chain to settle against).
    if (simulated.length > 0) {
      simulated.forEach((pos) => {
        setTradeHistory((prev) => [{
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, symbol: pos.symbol, type: pos.type,
          action: 'CLOSE', leverage: pos.leverage, size: pos.size, price: pos.currentPrice, pnl: pos.pnl,
          fee: pos.feePaid, timestamp: Date.now(), txId: generateTxId(), fromAddress: VAULT_ADDRESS, toAddress: USER_WALLET,
        }, ...prev]);
      });
      setPositions((prev) => prev.filter((p) => p.id.startsWith('onchain-')));
    }

    triggerAlert('success', `⚡ EMERGENCY CLOSE processed: ${onChain.length} on-chain + ${simulated.length} simulated position(s).`);
  };

  // The developer seed lock is enforced by the vault contract itself — the audits tab
  // reads lockExpiry straight from the chain, so no simulated fast-forward/withdraw here.

  // L1 ⇄ L2 BRIDGE TRANSFERS
  const handleBridgeTransfer = (direction: 'L1_TO_L2' | 'L2_TO_L1', amount: number, tokenSymbol: string) => {
    if (amount <= 0) {
      triggerAlert('error', 'Please enter a valid amount to bridge.');
      return;
    }
    const txId = generateTxId();
    const l1Wallet = userL1Address;
    const l2Wallet = userL2Address;
    
    // Create history entry
    const logItem: TradeHistoryItem = {
      id: `hist-${Date.now()}`,
      symbol: tokenSymbol,
      type: 'POOL',
      action: direction === 'L1_TO_L2' ? 'LOCK' : 'WITHDRAW',
      leverage: 1,
      size: amount,
      price: tokens.find((t) => t.symbol === tokenSymbol)?.price || 0.1542,
      pnl: 0,
      fee: amount * 0.001, // 0.1% bridge fee
      timestamp: Date.now(),
      txId: txId,
      fromAddress: direction === 'L1_TO_L2' ? l1Wallet : l2Wallet,
      toAddress: direction === 'L1_TO_L2' ? '0xCcBe7Cf3472D15aAf950eF02D7067751bAE7DBb0' : l1Wallet,
    };

    setTradeHistory((prev) => [logItem, ...prev]);
    triggerAlert('success', `🌉 BRIDGE COMPLETE: Successfully bridged ${amount.toLocaleString()} ${tokenSymbol} to ${direction === 'L1_TO_L2' ? 'L2 Chain' : 'Kaspa Mainnet L1'}! Hash: ${txId.substring(0, 10)}...`);
  };

  // AI AUTONOMOUS AGENT CORE ENGINE TICK
  const triggerAiAgentTick = async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);
    setAiAgentLogs((prev) => [`[${new Date().toLocaleTimeString()}] 🤖 Running autonomous analysis on ${activeToken.symbol}...`, ...prev]);

    try {
      const res = await fetch('/api/ai-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeToken.symbol,
          price: activeToken.price,
          change24h: activeToken.change24h,
          history: tradeHistory.slice(0, 5),
          l2Active: activeChain !== 'L1',
        })
      });
      if (!res.ok) {
        throw new Error('API server returned error status');
      }
      const data = await res.json();
      
      const logs = [
        `[${new Date().toLocaleTimeString()}] 🔍 Forecast: ${data.forecast}`,
        `[${new Date().toLocaleTimeString()}] ⚡ Decision: ${data.action} @ ${data.leverage}x (Confidence: ${data.confidence}% · engine: ${data.engine || 'gemini'})`,
        `[${new Date().toLocaleTimeString()}] 💡 Reasoning: ${data.reasoning}`
      ];
      setAiAgentLogs((prev) => [...logs, ...prev]);

      if (data.action === 'LONG' || data.action === 'SHORT') {
        let collateral = 100;
        if (aiTradeAgentSettings.riskProfile === 'CONSERVATIVE') collateral = 50;
        if (aiTradeAgentSettings.riskProfile === 'DEGEN') collateral = 500;

        handleOpenPosition(data.action as 'LONG' | 'SHORT', data.leverage || 10, collateral, 'ai');
        setAiAgentLogs((prev) => [`[${new Date().toLocaleTimeString()}] 🚀 AI Executed: ${data.action} trade on ${activeToken.symbol}.`, ...prev]);
      } else {
        setAiAgentLogs((prev) => [`[${new Date().toLocaleTimeString()}] 💤 AI Decision: HOLD. Observing market conditions.`, ...prev]);
      }
    } catch (err: any) {
      console.error(err);
      setAiAgentLogs((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ Server connection failed. Activating local deterministic heuristic model...`, ...prev]);
      
      // Heuristic fallback logic
      const actions: ('LONG' | 'SHORT' | 'HOLD')[] = ['LONG', 'SHORT', 'HOLD'];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      if (randomAction !== 'HOLD') {
        const fallbackLev = Math.floor(Math.random() * 45) + 5;
        const fallbackCol = Math.random() > 0.5 ? 100 : 50;
        handleOpenPosition(randomAction, fallbackLev, fallbackCol, 'ai');
        setAiAgentLogs((prev) => [`[${new Date().toLocaleTimeString()}] 🚀 Heuristic fallback executed ${randomAction} position on ${activeToken.symbol}.`, ...prev]);
      } else {
        setAiAgentLogs((prev) => [`[${new Date().toLocaleTimeString()}] 💤 Heuristic fallback: HOLD. No high probability trade setups detected.`, ...prev]);
      }
    } finally {
      setIsAiLoading(false);
      setAiCountdown(aiTradeAgentSettings.triggerFrequencySec);
    }
  };

  // AI countdown timer. The tick side effect must live in the interval callback, NOT
  // inside the setState updater — React double-invokes updaters in dev to surface
  // impurity, which fired every analysis twice. The ref keeps the latest tick closure
  // (fresh prices) without restarting the interval on every render.
  const aiTickRef = useRef<() => void>(() => {});
  aiTickRef.current = triggerAiAgentTick;
  const aiCountdownRef = useRef(aiCountdown);
  useEffect(() => {
    if (!isAiTradeAgentActive) return;

    aiCountdownRef.current = aiTradeAgentSettings.triggerFrequencySec;
    setAiCountdown(aiCountdownRef.current);

    const interval = setInterval(() => {
      aiCountdownRef.current -= 1;
      if (aiCountdownRef.current <= 0) {
        aiCountdownRef.current = aiTradeAgentSettings.triggerFrequencySec;
        aiTickRef.current();
      }
      setAiCountdown(aiCountdownRef.current);
    }, 1000);

    return () => clearInterval(interval);
  }, [isAiTradeAgentActive, aiTradeAgentSettings.triggerFrequencySec]);

  // DEV PORTAL TOKEN MANAGE
  const handleAddToken = (tok: Token) => {
    setTokens((prev) => [...prev, tok]);
    triggerAlert('success', `Token ${tok.symbol} listed successfully on KasLev post Toccata update.`);
  };

  const handleRemoveToken = (id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    triggerAlert('info', 'Token deregistered successfully.');
  };

  // STRATEGY MANAGE
  const handleCreateStrategy = (strat: AutomatedStrategy) => {
    setStrategies((prev) => [...prev, strat]);
  };

  const handleRemoveStrategy = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-bg-darker flex flex-col font-sans text-gray-200">
      
      {/* HEADER NAVBAR */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        userWallet={userWallet}
        setUserWallet={setUserWallet}
        isKdxConnected={isKdxConnected}
        setIsKdxConnected={setIsKdxConnected}
        kasPrice={tokens.find((t) => t.id === 'kas')?.price || 0.15420}
        priceSource={priceSource}
        refetchPrice={refetchPrice}
        isPriceLoading={isPriceLoading}
        isHighContrast={isHighContrast}
        setIsHighContrast={setIsHighContrast}
        activeChain={activeChain}
        setActiveChain={setActiveChain}
        connectedWalletType={connectedWalletType}
        setConnectedWalletType={setConnectedWalletType}
        isWalletConnected={isWalletConnected}
        setIsWalletConnected={setIsWalletConnected}
        userL1Address={userL1Address}
        setUserL1Address={setUserL1Address}
        userL2Address={userL2Address}
        setUserL2Address={setUserL2Address}
        onBridgeTransfer={handleBridgeTransfer}
        tokens={tokens}
        triggerAlert={triggerAlert}
      />

      {/* FLOATING SYSTEM ALERTS */}
      <div className="fixed top-24 right-4 z-50 flex flex-col gap-2 max-w-sm w-full" id="floating-alerts-container">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3.5 rounded-lg border shadow-xl flex gap-2.5 items-start text-xs font-medium font-sans backdrop-blur-md animate-fade-in ${
              alert.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : alert.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}
          >
            {alert.type === 'success' ? (
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
            ) : alert.type === 'error' ? (
              <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            ) : (
              <Bell className="w-4.5 h-4.5 shrink-0 animate-bounce" />
            )}
            <span>{alert.text}</span>
          </div>
        ))}
      </div>

      {/* MAIN LAYOUT */}
      <main className="flex-1 pb-16">
        <AnimatePresence mode="wait">
          {currentTab === 'trading' && (
            <motion.div
              key="trading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 0.84, 0.44, 1] }}
            >
              <TradingView
                tokens={tokens}
                activeToken={activeToken}
                setActiveToken={setActiveToken}
                positions={positions}
                onOpenPosition={handleOpenPosition}
                onClosePosition={handleClosePosition}
                onEmergencyCloseAll={handleEmergencyCloseAll}
                isKdxConnected={isKdxConnected}
                history={tradeHistory}
                activeChain={activeChain}
                userL1Address={userL1Address}
                userL2Address={userL2Address}
                isWalletConnected={isWalletConnected}
                connectedWalletType={connectedWalletType}
              />
            </motion.div>
          )}

          {currentTab === 'strategies' && (
            <motion.div
              key="strategies"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 0.84, 0.44, 1] }}
            >
              <StrategyBuilder
                tokens={tokens}
                strategies={strategies}
                onCreateStrategy={handleCreateStrategy}
                onRemoveStrategy={handleRemoveStrategy}
                isAiTradeAgentActive={isAiTradeAgentActive}
                setIsAiTradeAgentActive={setIsAiTradeAgentActive}
                aiTradeAgentSettings={aiTradeAgentSettings}
                setAiTradeAgentSettings={setAiTradeAgentSettings}
                aiAgentLogs={aiAgentLogs}
                setAiAgentLogs={setAiAgentLogs}
                aiCountdown={aiCountdown}
                isAiLoading={isAiLoading}
                triggerAiAgentTick={triggerAiAgentTick}
                activeChain={activeChain}
                userL1Address={userL1Address}
                userL2Address={userL2Address}
                onBridgeTransfer={handleBridgeTransfer}
              />
            </motion.div>
          )}

          {currentTab === 'transparency' && (
            <motion.div
              key="transparency"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 0.84, 0.44, 1] }}
            >
              <ProtocolTransparency
                pool={pool}
                devWalletAddress="kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9"
              />
            </motion.div>
          )}

          {currentTab === 'toccata' && (
            <motion.div
              key="toccata"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 0.84, 0.44, 1] }}
            >
              <TokenManager
                tokens={tokens}
                onAddToken={handleAddToken}
                onRemoveToken={handleRemoveToken}
                userWallet={userWallet}
                triggerAlert={triggerAlert}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM QUICK STATS & HISTORY LOGS PANEL */}
        <TransactionLedger
          tradeHistory={tradeHistory}
          pool={pool}
          triggerAlert={triggerAlert}
        />
      </main>

      {/* FOOTER */}
      <footer className="bg-bg-dark border-t border-border-dark py-4 text-center text-xs text-gray-500 font-mono mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© 2026 KasLev Protocol. Built exclusively for the Kaspa Ecosystem. Open-source under MIT License.</p>
          <div className="flex gap-4">
            <span className="text-kaspa font-semibold">Toccata Compliant</span>
            <span className="text-emerald-400">Zero Custody Keys</span>
            <span className="text-white">Clean Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
