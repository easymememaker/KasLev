/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, AlertOctagon, TrendingUp, TrendingDown, Layers, ShieldAlert, Swords, HelpCircle, Flame, X, Sparkles, Info } from 'lucide-react';
import CandleChart from './CandleChart';
import { Token, Position, OrderBookItem, TradeHistoryItem } from '../types';
import { getFeePercentage, calculateLiquidationPrice, calculatePositionSize } from '../utils/math';
import { quoteOpenCost, isSupportedNetwork, getActiveNetwork, getHouseRules, getOraclePrice, HouseRules } from '../web3/kaslev';

interface TradingViewProps {
  tokens: Token[];
  activeToken: Token;
  setActiveToken: (token: Token) => void;
  positions: Position[];
  onOpenPosition: (type: 'LONG' | 'SHORT', leverage: number, collateral: number) => void;
  onClosePosition: (id: string) => void;
  onEmergencyCloseAll: () => void;
  isKdxConnected: boolean;
  history: TradeHistoryItem[];
  activeChain?: 'L1' | 'L2_IGRA' | 'L2_SPARKLE' | 'L2_KASPLEX';
  userL1Address?: string;
  userL2Address?: string;
  isWalletConnected?: boolean;
  connectedWalletType?: 'KASPIUM' | 'KASWARE' | 'KDX' | 'METAMASK' | null;
  /** Live native balance of the connected wallet on the active L2 (null = unknown). */
  walletBalance?: number | null;
  /** Explicit paper-trading opt-in; with it off, trading needs a connected wallet. */
  practiceMode?: boolean;
  setPracticeMode?: (v: boolean) => void;
  /** Ask the shell to open the wallet-connect modal. */
  onRequestConnect?: () => void;
}

export default function TradingView({
  tokens,
  activeToken,
  setActiveToken,
  positions,
  onOpenPosition,
  onClosePosition,
  onEmergencyCloseAll,
  isKdxConnected,
  history,
  activeChain = 'L1',
  userL1Address = 'kaspa:qqzjw5ur7fyq9q7la72shhcfcq02j76uetfque833g2l7e8vmjkt2eqf5egkf',
  userL2Address = '0x7F268b82Ac901E9b7c84D76de02D70B92AcC6C00',
  isWalletConnected = false,
  connectedWalletType = null,
  walletBalance = null,
  practiceMode = false,
  setPracticeMode,
  onRequestConnect,
}: TradingViewProps) {
  // Trade setup form state
  const [collateralInput, setCollateralInput] = useState('10');
  const [customLeverage, setCustomLeverage] = useState('10'); // sane default: 10x

  // Quick leverage action sidebar states
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [quickCollateral, setQuickCollateral] = useState('100');

  // Simulated order book
  const [bids, setBids] = useState<OrderBookItem[]>([]);
  const [asks, setAsks] = useState<OrderBookItem[]>([]);

  // Simulated live Order Book updates
  useEffect(() => {
    const generateOrderBook = () => {
      const mid = activeToken.price;
      const newAsks: OrderBookItem[] = [];
      const newBids: OrderBookItem[] = [];
      
      let accumAsk = 0;
      let accumBid = 0;

      for (let i = 1; i <= 6; i++) {
        const askPrice = mid * (1 + (i * 0.0005));
        const bidPrice = mid * (1 - (i * 0.0005));
        
        const askAmt = Math.floor(Math.random() * 80000 + 10000) / (i * 0.5);
        const bidAmt = Math.floor(Math.random() * 80000 + 10000) / (i * 0.5);

        accumAsk += askAmt;
        accumBid += bidAmt;

        newAsks.unshift({ price: parseFloat(askPrice.toFixed(6)), amount: askAmt, total: accumAsk });
        newBids.push({ price: parseFloat(bidPrice.toFixed(6)), amount: bidAmt, total: accumBid });
      }

      setAsks(newAsks);
      setBids(newBids);
    };

    generateOrderBook();
    const bookInterval = setInterval(generateOrderBook, 1200);
    return () => clearInterval(bookInterval);
  }, [activeToken]);

  // Leverage calculations helper
  const parsedLeverage = parseFloat(customLeverage) || 10;
  
  const currentFeePercent = getFeePercentage(parsedLeverage);

  const collateralNum = parseFloat(collateralInput) || 0;
  const rawSizeKAS = collateralNum * parsedLeverage;
  const totalOpenFee = collateralNum * (currentFeePercent / 100);

  // Live on-chain cost quote (dev fee + keeper fee + total) for full transparency:
  // every charge the contract will take is shown before the user signs anything.
  const [chainQuote, setChainQuote] = useState<{ openFeeKas: number; keeperFeeKas: number; totalKas: number } | null>(null);
  const onChainNetwork = isSupportedNetwork(activeChain);
  useEffect(() => {
    if (!onChainNetwork || collateralNum <= 0 || parsedLeverage <= 0) {
      setChainQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await quoteOpenCost(parsedLeverage, collateralNum);
        if (!cancelled) setChainQuote(q);
      } catch {
        if (!cancelled) setChainQuote(null);
      }
    }, 400); // debounce while the user types
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [onChainNetwork, activeChain, collateralNum, parsedLeverage]);
  const nativeSymbol = onChainNetwork ? getActiveNetwork().nativeCurrency.symbol : 'KAS';

  // Real-exchange gating: on-chain trading needs MetaMask; otherwise only the
  // explicitly-enabled practice mode may simulate.
  const isTradeReady = isWalletConnected && connectedWalletType === 'METAMASK';
  const totalCostKas = onChainNetwork && chainQuote ? chainQuote.totalKas : collateralNum + totalOpenFee;
  const insufficientBalance = isTradeReady && walletBalance !== null && totalCostKas > walletBalance;
  const faucetUrl = onChainNetwork && getActiveNetwork().key === 'L2_KASPLEX'
    ? 'https://faucet.zealousswap.com/'
    : 'https://app.kaspafinance.io/faucets';

  // On-chain oracle health. The median oracle reports price 0 when it has fewer than
  // minSources fresh reports — in that state every openPosition tx reverts (ZeroPrice),
  // so tell the user BEFORE they sign instead of letting the wallet call fail.
  // 'unknown' = still checking / not applicable; 'live' = tradeable; 'stale' = paused.
  const [oracleHealth, setOracleHealth] = useState<{ status: 'unknown' | 'live' | 'stale'; price: number }>({ status: 'unknown', price: 0 });
  useEffect(() => {
    if (!onChainNetwork) {
      setOracleHealth({ status: 'unknown', price: 0 });
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const { price } = await getOraclePrice('KAS');
        if (!cancelled) setOracleHealth({ status: price > 0 ? 'live' : 'stale', price });
      } catch {
        if (!cancelled) setOracleHealth({ status: 'unknown', price: 0 });
      }
    };
    check();
    const t = setInterval(check, 30000); // matches the keeper's push cadence
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [onChainNetwork, activeChain]);

  // House-edge parameters, read once per network from the contract itself so the
  // disclosure below can never drift from what's actually deployed.
  const [houseRules, setHouseRules] = useState<HouseRules | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    if (!onChainNetwork) {
      setHouseRules(null);
      return;
    }
    let cancelled = false;
    getHouseRules()
      .then((r) => !cancelled && setHouseRules(r))
      .catch(() => !cancelled && setHouseRules(null));
    return () => {
      cancelled = true;
    };
  }, [onChainNetwork, activeChain]);

  // Quick leverage preset triggers
  const setLeveragePreset = (val: number) => {
    setCustomLeverage(val.toString());
  };

  const estLiquidation = activeToken ? calculateLiquidationPrice('LONG', activeToken.price, parsedLeverage) : 0;
  const estLiquidationShort = activeToken ? calculateLiquidationPrice('SHORT', activeToken.price, parsedLeverage) : 0;

  const kasPrice = tokens.find((t) => t.id === 'kas')?.price || 0.1542;

  const quickLeveragePresets = [
    { value: 2, label: '2x', risk: 'Low Risk', desc: 'Conservative DAG trading' },
    { value: 5, label: '5x', risk: 'Low Risk', desc: 'Moderate DAG trading' },
    { value: 10, label: '10x', risk: 'Medium Risk', desc: 'Standard leveraged exposure' },
    { value: 25, label: '25x', risk: 'Medium Risk', desc: 'Aggressive swing position' },
    { value: 50, label: '50x', risk: 'High Risk', desc: 'Intense volatility matching' },
    { value: 100, label: '100x', risk: 'High Risk', desc: 'Extreme momentum trading' },
    { value: 1000, label: '1,000x', risk: 'Degenerate', desc: 'Maximum block-speed leverage' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 max-w-7xl mx-auto" id="trading-terminal-grid">
      
      {/* 24H TICKER STATS (SPAN 12) */}
      <div className="lg:col-span-12 bg-bg-dark rounded-xl border border-border-dark px-4 py-3 flex flex-wrap justify-between items-center gap-4 text-xs font-mono" id="live-ticker-banner">
        <div className="flex items-center gap-4">
          <div className="relative">
            <select
              id="terminal-token-select"
              value={activeToken.id}
              onChange={(e) => {
                const selected = tokens.find((t) => t.id === e.target.value);
                if (selected) setActiveToken(selected);
              }}
              className="bg-bg-darker text-white border border-border-dark focus:border-kaspa focus:outline-none rounded-lg px-3 py-1.5 font-sans font-bold text-sm cursor-pointer"
            >
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol} / USDT
                </option>
              ))}
            </select>
          </div>

          <button
            id="quick-actions-sidebar-toggle"
            onClick={() => setShowQuickActions(!showQuickActions)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
              showQuickActions
                ? 'bg-kaspa/15 border-kaspa text-kaspa shadow-[0_0_8px_rgba(20,184,166,0.25)]'
                : 'bg-bg-darker border-border-dark text-gray-400 hover:text-white hover:border-gray-500'
            }`}
            title="Open Predefined Leverage Single-Click Sidebar"
          >
            <Zap className={`w-3.5 h-3.5 text-kaspa ${showQuickActions ? 'animate-bounce' : 'animate-pulse'}`} />
            <span>Quick Actions</span>
          </button>

          <div className="hidden sm:block text-right border-r border-border-dark pr-4">
            <span className="text-gray-400 block text-[10px]">Price</span>
            <span className="text-sm font-bold text-white">${activeToken.price.toFixed(6)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full lg:flex-1 lg:justify-end lg:max-w-2xl">
          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">24h Change</span>
            <span className={`text-xs font-bold ${activeToken.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {activeToken.change24h >= 0 ? '+' : ''}{activeToken.change24h.toFixed(2)}%
            </span>
          </div>
          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">24h High <span className="text-gray-600">·sim</span></span>
            <span className="text-xs text-white">${(activeToken.price * 1.05).toFixed(6)}</span>
          </div>
          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">24h Low <span className="text-gray-600">·sim</span></span>
            <span className="text-xs text-white">${(activeToken.price * 0.95).toFixed(6)}</span>
          </div>
          <div className="text-right hidden sm:block">
            <span className="text-gray-400 block text-[10px]">Funding Rate <span className="text-gray-600">·sim</span></span>
            <span className="text-xs text-kaspa font-bold">0.0001% / hr</span>
          </div>
        </div>
      </div>

      {/* LEFT PORTION: Chart & Positions (Col Span 8) */}
      <div className="lg:col-span-8 flex flex-col gap-5">
        
        {/* Live market chart — TradingView lightweight-charts, real candles + volume */}
        <div className="bg-bg-dark rounded-xl border border-border-dark shadow-lg flex flex-col h-[420px] relative overflow-hidden" id="trading-chart-card">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border-dark/60">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-kaspa animate-pulse" />
              <h3 className="font-display font-bold text-sm text-white tracking-wide">{activeToken.symbol} / USDT</h3>
              <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wider">live price · simulated candles</span>
            </div>
            <div className="flex items-center gap-1.5 bg-bg-darker px-2.5 py-1 rounded-md text-[10px] font-mono text-gray-400 border border-border-dark/60">
              <span className="w-1.5 h-1.5 rounded-full bg-kaspa animate-pulse" />
              <span>{isKdxConnected ? 'KDX Stream · Connected' : 'Oracle Feed · Connected'}</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 px-1 pb-1 pt-6">
            <CandleChart symbol={activeToken.symbol} price={activeToken.price} />
          </div>
        </div>

        {/* ACTIVE POSITIONS & EMERGENCY CLOSE PANEL */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-4 shadow-lg space-y-4" id="active-positions-panel">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Layers className="text-kaspa w-5 h-5" />
              <h3 className="font-display font-bold text-base text-white">Active Leverage Positions</h3>
              <span className="text-xs bg-bg-darker text-gray-400 px-2 py-0.5 rounded border border-border-dark font-mono">
                {positions.length} Positions Open
              </span>
            </div>

            {/* GIANT EMERGENCY CLOSE ALL BUTTON */}
            {positions.length > 0 && (
              <button
                id="emergency-close-all-btn"
                onClick={onEmergencyCloseAll}
                className="w-full sm:w-auto bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-mono text-xs px-3.5 py-2 rounded-lg border border-rose-900/50 transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wide"
              >
                <span>Close All Positions</span>
              </button>
            )}
          </div>

          {positions.length === 0 ? (
            <div className="bg-bg-darker rounded-xl p-8 border border-dashed border-border-dark text-center flex flex-col items-center justify-center">
              <ShieldAlert className="text-gray-600 w-12 h-12 mb-2 stroke-1" />
              <p className="text-sm font-semibold text-white">No active positions detected</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                Open a long or short position using the trade launcher panel on the right. Leverage from 10x up to 1,000,000x supported.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[650px]" id="positions-table">
                <thead>
                  <tr className="border-b border-border-dark text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Position Info</th>
                    <th className="py-2.5 px-3">Margin (KAS)</th>
                    <th className="py-2.5 px-3">Leverage</th>
                    <th className="py-2.5 px-3">Entry / Mark</th>
                    <th className="py-2.5 px-3">Liquidation Price</th>
                    <th className="py-2.5 px-3">Est. PnL (KAS)</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark text-xs">
                  {positions.map((pos) => {
                    const isLong = pos.type === 'LONG';
                    const isProfit = pos.pnl >= 0;

                    return (
                      <tr key={pos.id} id={`position-row-${pos.id}`} className="hover:bg-bg-darker/40 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                              isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {pos.type}
                            </span>
                            <span className="font-bold text-white">{pos.symbol}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono block mt-0.5">Size: {pos.size.toLocaleString()} {pos.symbol}</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-white">
                          {pos.margin.toLocaleString()} KAS
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-kaspa text-sm">
                          {pos.leverage.toLocaleString()}x
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <div className="text-white">${pos.entryPrice.toFixed(6)}</div>
                          <div className="text-[10px] text-gray-400">${pos.currentPrice.toFixed(6)}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-red-400 font-semibold">
                          ${pos.liquidationPrice.toFixed(6)}
                        </td>
                        <td className={`py-3 px-3 font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                          <div className="font-bold text-sm">
                            {isProfit ? '+' : ''}{pos.pnl.toFixed(2)} KAS
                          </div>
                          <div className="text-[10px] opacity-80">
                            {isProfit ? '+' : ''}{pos.pnlPercentage.toFixed(2)}%
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            id={`close-position-${pos.id}`}
                            onClick={() => onClosePosition(pos.id)}
                            className="bg-bg-darker hover:bg-red-500/10 border border-border-dark hover:border-red-500/40 text-gray-300 hover:text-red-400 px-2.5 py-1 rounded transition-all font-mono text-[10px] cursor-pointer"
                          >
                            Close Position
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PORTION: Trade Terminal & Order Book (Col Span 4) */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        
        {/* TRADE LAUNCHER TERMINAL */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-4" id="trade-terminal-launcher">
          <div className="flex items-center justify-between gap-2 border-b border-border-dark pb-2">
            <div className="flex items-center gap-2">
              <Zap className="text-kaspa w-5 h-5 animate-pulse" />
              <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">New Leverage Trade</h3>
            </div>
            
            <div className="flex items-center gap-1.5">
              {onChainNetwork && (
                <div
                  id="oracle-health-chip"
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold uppercase ${
                    oracleHealth.status === 'live'
                      ? 'bg-kaspa/10 border-kaspa/40 text-kaspa'
                      : oracleHealth.status === 'stale'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                        : 'bg-bg-darker border-border-dark text-gray-500'
                  }`}
                  title={
                    oracleHealth.status === 'live'
                      ? `On-chain oracle price: $${oracleHealth.price.toFixed(5)}`
                      : oracleHealth.status === 'stale'
                        ? 'The on-chain price feed has no fresh reports — real trades revert until the keeper pushes a price.'
                        : 'Checking the on-chain price feed…'
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      oracleHealth.status === 'live' ? 'bg-kaspa animate-pulse' : oracleHealth.status === 'stale' ? 'bg-rose-500' : 'bg-gray-600'
                    }`}
                  />
                  {oracleHealth.status === 'live' ? 'Oracle Live' : oracleHealth.status === 'stale' ? 'Oracle Stale' : 'Oracle …'}
                </div>
              )}
              <div className="flex items-center gap-1.5 bg-bg-darker px-2 py-0.5 rounded border border-border-dark">
                <span className={`w-1.5 h-1.5 rounded-full ${isWalletConnected ? 'bg-kaspa' : 'bg-gray-600'}`} />
                <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">{activeChain}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Dynamic Active Connection Details Widget */}
            <div className="bg-bg-darker/60 p-3 rounded-xl border border-border-dark flex items-center justify-between text-[11px] font-mono">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Active Wallet Connection</span>
                <span className="text-white font-bold flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isWalletConnected ? 'bg-kaspa animate-ping' : 'bg-gray-600'}`} />
                  {isWalletConnected ? `${connectedWalletType} Active` : 'Wallet Offline'}
                </span>
              </div>
              <div className="text-right flex flex-col gap-0.5 max-w-[150px]">
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Connected Address</span>
                <span className="text-kaspa font-semibold truncate block" title={activeChain === 'L1' ? userL1Address : userL2Address}>
                  {isWalletConnected 
                    ? (activeChain === 'L1' ? userL1Address : userL2Address)
                    : 'Not Connected'
                  }
                </span>
              </div>
            </div>

            {/* Collateral Input Selection (DEX style - chooseable, not range) */}
            <div>
              <div className="flex justify-between text-xs font-mono text-gray-400 mb-2">
                <span>Select Collateral ({nativeSymbol})</span>
                <span>
                  {isTradeReady && walletBalance !== null ? (
                    <>Balance: <span className={insufficientBalance ? 'text-rose-400 font-bold' : 'text-white font-bold'}>{walletBalance.toLocaleString(undefined, { maximumFractionDigits: 3 })} {nativeSymbol}</span></>
                  ) : practiceMode ? (
                    <span className="text-amber-400">Practice balance · simulated</span>
                  ) : (
                    'Balance: —'
                  )}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 font-mono" id="collateral-select-grid">
                {[10, 50, 100, 500, 1000].map((amount) => {
                  const isSelected = collateralNum === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      id={`collateral-opt-${amount}`}
                      onClick={() => setCollateralInput(amount.toString())}
                      className={`py-2 px-1 rounded text-xs font-bold border transition-all cursor-pointer text-center flex flex-col justify-center items-center ${
                        isSelected
                          ? 'bg-kaspa border-kaspa text-bg-dark font-black shadow-md shadow-kaspa/15'
                          : 'border-border-dark text-gray-300 hover:text-white bg-bg-darker hover:border-border-medium'
                      }`}
                    >
                      <span>{amount}</span>
                      <span className={`text-[8px] opacity-75 font-semibold`}>KAS</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Leverage Multiplier Selector (DEX style - chooseable, not range) */}
            <div>
              <div className="flex justify-between text-xs font-mono text-gray-400 mb-2">
                <span>Select Leverage (Fee is Clear)</span>
                <span className="text-kaspa font-bold">{parsedLeverage.toLocaleString()}x</span>
              </div>
              <div className="grid grid-cols-2 gap-2" id="leverage-select-grid">
                {[
                  { value: 5, label: '5x', desc: 'Safe', fee: '1.0%', feeColor: 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' },
                  { value: 10, label: '10x', desc: 'Low risk', fee: '1.0%', feeColor: 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' },
                  { value: 25, label: '25x', desc: 'Medium', fee: '1.0%', feeColor: 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' },
                  { value: 50, label: '50x', desc: 'High', fee: '1.0%', feeColor: 'text-amber-400 bg-amber-950/20 border-amber-900/30' },
                  { value: 100, label: '100x', desc: 'Very high', fee: '5.0%', feeColor: 'text-amber-400 bg-amber-950/20 border-amber-900/30' },
                  { value: 1000, label: '1,000x', desc: 'Degen', fee: '5.0%', feeColor: 'text-rose-400 bg-rose-950/20 border-rose-900/30' },
                ].map((opt) => {
                  const isSelected = parsedLeverage === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      id={`leverage-opt-${opt.value}`}
                      onClick={() => setCustomLeverage(opt.value.toString())}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between h-16 ${
                        isSelected
                          ? 'bg-kaspa/10 border-kaspa text-white shadow-md shadow-kaspa/10'
                          : 'border-border-dark text-gray-400 hover:text-white bg-bg-darker hover:border-border-medium'
                      }`}
                    >
                      {/* Active indicator bar */}
                      {isSelected && (
                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-kaspa" />
                      )}
                      
                      <div className="flex justify-between items-start w-full">
                        <span className={`text-xs font-mono font-bold ${isSelected ? 'text-kaspa' : 'text-gray-300'}`}>
                          {opt.label}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-black ${opt.feeColor}`}>
                          {opt.fee} FEE
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-end w-full">
                        <span className="text-[9px] font-sans text-gray-400 uppercase tracking-wider font-semibold">
                          {opt.desc}
                        </span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 bg-kaspa rounded-full animate-pulse" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minimal summary — one number that matters; everything else is in the Details modal. */}
            <div className="bg-bg-darker px-3 py-2 rounded-lg border border-border-dark flex items-center justify-between">
              <div className="leading-tight">
                <span className="text-gray-500 text-[9px] font-mono uppercase tracking-wider block">Total to open</span>
                <span className="text-kaspa font-bold text-sm font-mono">
                  {onChainNetwork && chainQuote
                    ? chainQuote.totalKas.toFixed(2)
                    : (collateralNum + (chainQuote?.openFeeKas ?? totalOpenFee)).toFixed(2)}{' '}
                  {nativeSymbol}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-kaspa border border-border-dark hover:border-kaspa/40 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <Info className="w-3.5 h-3.5" /> Fees &amp; rules
              </button>
            </div>

            {/* Practice (paper trading) toggle — explicit, clearly labeled */}
            <label className="flex items-center gap-2 cursor-pointer bg-bg-darker/60 p-2 rounded border border-border-dark/60 select-none">
              <input
                id="practice-mode-toggle"
                type="checkbox"
                checked={practiceMode}
                onChange={(e) => setPracticeMode?.(e.target.checked)}
                className="accent-amber-500 w-3.5 h-3.5 rounded"
              />
              <div className="text-[10px] font-mono leading-tight">
                <span className="text-white block font-bold">Practice Mode <span className="text-amber-400">(simulated)</span></span>
                <span className="text-gray-400">Paper-trade without a wallet — nothing is sent on-chain. Off = real on-chain trading only.</span>
              </div>
            </label>

            {/* Oracle-stale warning: a real tx would revert with ZeroPrice, so say it up front */}
            {onChainNetwork && oracleHealth.status === 'stale' && (
              <div
                id="oracle-stale-warning"
                className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 text-[10px] font-mono leading-tight"
              >
                <Info className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span className="text-rose-300">
                  <span className="font-bold text-rose-400">On-chain price feed is stale.</span> Real trades on{' '}
                  {getActiveNetwork().name} are paused until a keeper pushes a fresh price — transactions sent now will
                  revert. Simulated trading still works.
                </span>
              </div>
            )}

            {/* Insufficient real balance — block before the wallet even opens */}
            {isTradeReady && !practiceMode && insufficientBalance && (
              <div
                id="insufficient-balance-warning"
                className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[10px] font-mono leading-tight"
              >
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-amber-200">
                  <span className="font-bold text-amber-400">Not enough {nativeSymbol}.</span> This trade needs{' '}
                  {totalCostKas.toFixed(2)} {nativeSymbol} (margin + fees) but the wallet holds{' '}
                  {walletBalance?.toFixed(3)}.{' '}
                  <a href={faucetUrl} target="_blank" rel="noreferrer" className="underline text-kaspa hover:text-kaspa-light">
                    Get free testnet {nativeSymbol} →
                  </a>
                </span>
              </div>
            )}

            {/* OPEN POSITIONS EXECUTION ACTIONS — a real DEX: no wallet, no trade */}
            {!isTradeReady && !practiceMode ? (
              <button
                id="connect-to-trade-btn"
                onClick={() => onRequestConnect?.()}
                className="w-full bg-gradient-to-b from-kaspa to-kaspa-dark hover:from-kaspa-light hover:to-kaspa text-bg-darker font-display font-black text-sm py-3.5 px-4 rounded-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center gap-2 border border-kaspa/40 shadow-[0_4px_16px_rgba(20,184,166,0.35)]"
              >
                <Zap className="w-4.5 h-4.5" />
                CONNECT WALLET TO TRADE
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  id="order-open-long-btn"
                  disabled={!practiceMode && insufficientBalance}
                  onClick={() => onOpenPosition('LONG', parsedLeverage, collateralNum)}
                  className="bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-display font-bold text-xs py-2.5 px-4 rounded-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col items-center gap-0.5 border border-emerald-400/30 shadow-[0_4px_16px_rgba(16,185,129,0.25)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] disabled:transform-none disabled:shadow-none"
                >
                  <TrendingUp className="w-4.5 h-4.5 text-emerald-100" />
                  <span className="text-[12px] font-black tracking-wide">BUY / LONG</span>
                  <span className="text-[9px] opacity-80 font-mono font-medium">Fee: {currentFeePercent}%</span>
                </button>

                <button
                  id="order-open-short-btn"
                  disabled={!practiceMode && insufficientBalance}
                  onClick={() => onOpenPosition('SHORT', parsedLeverage, collateralNum)}
                  className="bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600 text-white font-display font-bold text-xs py-2.5 px-4 rounded-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col items-center gap-0.5 border border-rose-400/30 shadow-[0_4px_16px_rgba(244,63,94,0.25)] hover:shadow-[0_6px_20px_rgba(244,63,94,0.4)] disabled:transform-none disabled:shadow-none"
                >
                  <TrendingDown className="w-4.5 h-4.5 text-rose-100" />
                  <span className="text-[12px] font-black tracking-wide">SELL / SHORT</span>
                  <span className="text-[9px] opacity-80 font-mono font-medium">Fee: {currentFeePercent}%</span>
                </button>
              </div>
            )}

            {practiceMode && (
              <p className="text-center text-[10px] font-mono text-amber-400/80 -mt-1" id="practice-mode-note">
                Practice mode — orders are simulated, nothing is sent on-chain.
              </p>
            )}
          </div>
        </div>

        {/* ORDER BOOK SECTION */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-4 shadow-lg space-y-2" id="order-book-card">
          <div className="flex justify-between items-center border-b border-border-dark pb-2">
            <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">Order Book <span className="text-gray-500 font-mono normal-case">· sim</span></h3>
            <span className="text-[10px] text-gray-400 font-mono">
              Spread:{' '}
              <span className="text-white font-semibold">
                {asks.length && bids.length
                  ? (((asks[asks.length - 1].price - bids[0].price) / activeToken.price) * 100).toFixed(3)
                  : '0.050'}%
              </span>
            </span>
          </div>

          {/* column headers */}
          <div className="flex justify-between px-1 text-[9px] font-mono text-gray-500 uppercase tracking-wider">
            <span>Price (USDT)</span>
            <span>Amount</span>
            <span>Total</span>
          </div>

          <div className="space-y-1 text-[11px] font-mono">
            {/* Ask Stack (Sell orders) - Red */}
            <div className="space-y-px">
              {asks.map((ask, idx) => (
                <div key={idx} className="flex justify-between text-rose-400 relative h-5 items-center px-1 overflow-hidden rounded-sm">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-rose-500/10 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(100, (ask.total / 500000) * 100)}%` }}
                  />
                  <span className="z-10 font-semibold">{ask.price.toFixed(6)}</span>
                  <span className="z-10 text-gray-300">{ask.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="z-10 text-gray-500">{ask.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>

            {/* Mid Price */}
            <div className="flex items-center justify-center gap-2 py-1.5 bg-bg-darker rounded-md border border-border-dark/70 my-1">
              <span className={`text-sm font-bold ${activeToken.change24h >= 0 ? 'text-kaspa' : 'text-rose-400'}`}>
                {activeToken.price.toFixed(6)}
              </span>
              {activeToken.change24h >= 0
                ? <TrendingUp className="w-3.5 h-3.5 text-kaspa" />
                : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
              <span className="text-[10px] text-gray-500">mid</span>
            </div>

            {/* Bid Stack (Buy orders) - Green */}
            <div className="space-y-px">
              {bids.map((bid, idx) => (
                <div key={idx} className="flex justify-between text-kaspa relative h-5 items-center px-1 overflow-hidden rounded-sm">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-kaspa/10 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(100, (bid.total / 500000) * 100)}%` }}
                  />
                  <span className="z-10 font-semibold">{bid.price.toFixed(6)}</span>
                  <span className="z-10 text-gray-300">{bid.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="z-10 text-gray-500">{bid.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* QUICK ACTION SIDEBAR DRAWER */}
      <AnimatePresence>
        {showQuickActions && (
          <>
            <motion.div 
              key="quick-action-backdrop"
              id="quick-action-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 cursor-pointer"
              onClick={() => setShowQuickActions(false)}
            />
            <motion.div 
              key="quick-action-sidebar"
              id="quick-action-sidebar"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 md:w-[420px] bg-bg-card border-l border-border-dark shadow-2xl z-50 flex flex-col"
            >
              {/* Sidebar Header */}
              <div className="p-4 border-b border-border-dark flex justify-between items-center bg-bg-darker/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-kaspa/10 rounded-lg flex items-center justify-center border border-kaspa/20">
                    <Zap className="text-kaspa w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-sm font-display font-black tracking-wider text-white uppercase">Quick Leverage Actions</h2>
                    <span className="text-[10px] text-gray-400 block font-mono">One-click instant market order launcher</span>
                  </div>
                </div>
                <button 
                  id="close-quick-sidebar-btn"
                  onClick={() => setShowQuickActions(false)}
                  className="p-1.5 rounded-lg border border-border-dark text-gray-400 hover:text-white hover:bg-bg-darker transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sidebar Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {/* Selected Token display */}
                <div className="bg-bg-darker/80 border border-border-dark rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono tracking-wider">Active Instrument</span>
                    <span className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-kaspa" />
                      {activeToken.symbol} / USDT
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block uppercase font-mono tracking-wider">Live Oracle Price</span>
                    <span className="text-sm font-mono font-bold text-kaspa">${activeToken.price.toFixed(6)}</span>
                  </div>
                </div>

                {/* Quick Action Collateral config */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono text-gray-400">
                    <span>Set Collateral per Trade</span>
                    <span className="text-white font-bold">{quickCollateral} KAS</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 font-mono">
                    {[10, 50, 100, 500, 1000].map((amt) => {
                      const isSel = parseFloat(quickCollateral) === amt;
                      return (
                        <button
                          key={amt}
                          id={`quick-coll-preset-${amt}`}
                          type="button"
                          onClick={() => setQuickCollateral(amt.toString())}
                          className={`py-1.5 px-1 rounded text-[11px] font-bold border transition-all cursor-pointer text-center ${
                            isSel
                              ? 'bg-kaspa border-kaspa text-bg-dark font-extrabold shadow-md shadow-kaspa/10'
                              : 'border-border-dark text-gray-300 hover:text-white bg-bg-darker hover:border-gray-500'
                          }`}
                        >
                          {amt}
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="relative mt-2">
                    <input
                      id="quick-coll-custom-input"
                      type="number"
                      placeholder="Custom KAS Collateral"
                      value={quickCollateral}
                      onChange={(e) => setQuickCollateral(e.target.value)}
                      className="w-full bg-bg-darker text-white border border-border-dark focus:border-kaspa focus:outline-none rounded-lg px-3 py-1.5 font-mono text-xs"
                    />
                    <span className="absolute right-3 top-2 text-[10px] text-gray-400 font-mono">KAS</span>
                  </div>
                </div>

                {/* Quick Actions List */}
                <div className="space-y-3 pt-2">
                  <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block border-b border-border-dark pb-1.5">
                    Instant Execution Cards
                  </span>

                  {quickLeveragePresets.map((opt) => {
                    const lev = opt.value;
                    const collateralVal = parseFloat(quickCollateral) || 0;
                    const sizeInTokens = calculatePositionSize(collateralVal, lev, kasPrice, activeToken.price);
                    const sizeInKAS = collateralVal * lev;
                    const estLiqLong = calculateLiquidationPrice('LONG', activeToken.price, lev);
                    const estLiqShort = calculateLiquidationPrice('SHORT', activeToken.price, lev);
                    const feePercentage = getFeePercentage(lev);
                    const estFee = collateralVal * (feePercentage / 100);

                    return (
                      <div 
                        key={lev}
                        id={`quick-card-${lev}x`}
                        className="bg-bg-dark border border-border-dark hover:border-border-medium rounded-xl p-3.5 space-y-3 transition-all hover:bg-bg-darker/30"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-base font-display font-black text-white">{opt.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider ${
                                lev >= 100 
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                  : lev >= 10 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {opt.risk}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 block mt-0.5">{opt.desc}</span>
                          </div>
                          <div className="text-right font-mono text-[10px] text-gray-400">
                            <div>Size: <span className="text-white font-semibold">{sizeInKAS.toLocaleString()} KAS</span></div>
                            <div className="text-[9px] opacity-75">≈ {sizeInTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} {activeToken.symbol}</div>
                          </div>
                        </div>

                        {/* Calculations Preview Drawer */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-bg-darker/60 p-2 rounded-lg border border-border-dark/40 text-gray-400">
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-gray-500">Long Liq. Price</span>
                            <span className="text-emerald-400 font-bold">${estLiqLong.toFixed(6)}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-gray-500">Short Liq. Price</span>
                            <span className="text-red-400 font-bold">${estLiqShort.toFixed(6)}</span>
                          </div>
                          <div className="col-span-2 border-t border-border-dark/40 pt-1 flex justify-between">
                            <span>Est. Position Fee ({feePercentage}%):</span>
                            <span className="text-white font-bold">{estFee.toFixed(2)} KAS</span>
                          </div>
                        </div>

                        {/* Quick Order Actions Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            id={`quick-buy-${lev}x`}
                            onClick={() => onOpenPosition('LONG', lev, collateralVal)}
                            className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-mono font-bold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs border border-emerald-500/20"
                          >
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-200" />
                            <span>Buy / Long</span>
                          </button>
                          <button
                            id={`quick-sell-${lev}x`}
                            onClick={() => onOpenPosition('SHORT', lev, collateralVal)}
                            className="bg-rose-600/90 hover:bg-rose-500 text-white font-mono font-bold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs border border-rose-500/20"
                          >
                            <TrendingDown className="w-3.5 h-3.5 text-rose-200" />
                            <span>Sell / Short</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Footer Info */}
              <div className="p-4 border-t border-border-dark bg-bg-darker/50 space-y-1">
                <div className="flex gap-2 text-amber-300/90 text-[10px] leading-tight bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>One-click actions execute trades instantly. Risk multipliers scale with leverage tiers. Always monitor margin!</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FEES & HOUSE RULES — small transparency window, opened from the trade panel */}
      {showDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="bg-bg-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-white text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-kaspa" /> Fees &amp; House Rules
              </h3>
              <button onClick={() => setShowDetails(false)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between text-gray-400">
                <span>Open fee ({currentFeePercent}%)</span>
                <span className="text-white">{(chainQuote?.openFeeKas ?? totalOpenFee).toFixed(2)} {nativeSymbol}</span>
              </div>
              {onChainNetwork && (
                <div className="flex justify-between text-gray-400">
                  <span>Keeper fee</span>
                  <span className="text-white">{chainQuote ? chainQuote.keeperFeeKas.toFixed(2) : '…'} {nativeSymbol}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-300 border-t border-border-dark/50 pt-1.5">
                <span>Total to open</span>
                <span className="text-kaspa font-bold">
                  {onChainNetwork && chainQuote
                    ? chainQuote.totalKas.toFixed(2)
                    : (collateralNum + (chainQuote?.openFeeKas ?? totalOpenFee)).toFixed(2)} {nativeSymbol}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Liq. price — Long</span>
                <span className="text-amber-400">${estLiquidation.toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Liq. price — Short</span>
                <span className="text-amber-400">${estLiquidationShort.toFixed(6)}</span>
              </div>
            </div>

            {onChainNetwork && (
              <div className="text-[10px] text-gray-400 leading-relaxed border-t border-border-dark/50 pt-2.5">
                Close charges the same {currentFeePercent}% fee. On liquidation your margin goes to the pool;{' '}
                {houseRules ? houseRules.liqSharePct : 5}% of it is the protocol's disclosed house share. Max profit per
                position is {houseRules ? houseRules.maxProfitPct : 900}% of margin, capped at{' '}
                {houseRules ? houseRules.maxPayoutPoolPct : 2}% of the pool — read live from the contract.
              </div>
            )}

            <div className="flex gap-2 text-amber-300/90 text-[10px] leading-tight bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>High leverage multiplies risk — a small move can liquidate you fast. Keep enough collateral.</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
