/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap, AlertOctagon, TrendingUp, TrendingDown, Layers, ShieldAlert, Swords, HelpCircle, Flame, X, Sparkles, Info } from 'lucide-react';
import { Token, Position, OrderBookItem, TradeHistoryItem } from '../types';
import { getFeePercentage, calculateLiquidationPrice, calculatePositionSize } from '../utils/math';

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
}

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  body: [number, number];
  wick: [number, number];
  isUp: boolean;
  volume: number;
}

const CandlestickTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as CandleData;
    return (
      <div className="bg-bg-card border border-border-dark p-3 rounded-lg shadow-xl font-mono text-xs text-gray-300 space-y-1 z-50">
        <div className="text-kaspa font-bold border-b border-border-dark pb-1 mb-1">{data.time}</div>
        <div className="flex justify-between gap-4">
          <span>Open:</span>
          <span className="text-white font-semibold">${data.open.toFixed(6)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>High:</span>
          <span className="text-emerald-400 font-semibold">${data.high.toFixed(6)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Low:</span>
          <span className="text-rose-400 font-semibold">${data.low.toFixed(6)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Close:</span>
          <span className="text-white font-semibold">${data.close.toFixed(6)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Volume:</span>
          <span className="text-gray-400 font-semibold">{data.volume.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  return null;
};

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
}: TradingViewProps) {
  // Trade setup form state
  const [collateralInput, setCollateralInput] = useState('1000');
  const [customLeverage, setCustomLeverage] = useState('10000'); // defaults to floor 10000x
  const [useInstantSignature, setUseInstantSignature] = useState(true);

  // Quick leverage action sidebar states
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [quickCollateral, setQuickCollateral] = useState('100');

  // Generate some real-time candlestick chart data for active token
  const [chartData, setChartData] = useState<CandleData[]>([]);
  const tickCountRef = useRef(0);
  
  // Simulated order book
  const [bids, setBids] = useState<OrderBookItem[]>([]);
  const [asks, setAsks] = useState<OrderBookItem[]>([]);

  // Trigger chart data generation whenever active token changes
  useEffect(() => {
    const basePrice = activeToken.price;
    const data: CandleData[] = [];
    const now = new Date();
    let currentOpen = basePrice * (1 - (Math.random() - 0.5) * 0.04);
    
    for (let i = 24; i >= 0; i--) {
      const timeStr = new Date(now.getTime() - i * 15 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const change = (Math.random() - 0.48) * 0.015 * currentOpen;
      const currentClose = currentOpen + change;
      const high = Math.max(currentOpen, currentClose) + Math.random() * 0.004 * currentOpen;
      const low = Math.min(currentOpen, currentClose) - Math.random() * 0.004 * currentOpen;
      const isUp = currentClose >= currentOpen;
      
      data.push({
        time: timeStr,
        open: parseFloat(currentOpen.toFixed(6)),
        high: parseFloat(high.toFixed(6)),
        low: parseFloat(low.toFixed(6)),
        close: parseFloat(currentClose.toFixed(6)),
        body: [Math.min(currentOpen, currentClose), Math.max(currentOpen, currentClose)],
        wick: [low, high],
        isUp,
        volume: Math.floor(Math.random() * 500000 + 100000),
      });
      currentOpen = currentClose;
    }
    setChartData(data);
    tickCountRef.current = 0;
  }, [activeToken]);

  // Keep the chart updating in real time matching price ticks
  useEffect(() => {
    tickCountRef.current = 0;
    const interval = setInterval(() => {
      setChartData((prev) => {
        if (prev.length === 0) return prev;
        
        tickCountRef.current += 1;
        
        if (tickCountRef.current >= 10) {
          // Roll over to a new candle!
          tickCountRef.current = 0;
          const lastCandle = prev[prev.length - 1];
          const nextTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const newOpen = lastCandle.close;
          const variance = (Math.random() - 0.5) * 0.0005 * activeToken.price;
          const newClose = parseFloat((activeToken.price + variance).toFixed(6));
          const high = Math.max(newOpen, newClose) + Math.random() * 0.001 * activeToken.price;
          const low = Math.min(newOpen, newClose) - Math.random() * 0.001 * activeToken.price;
          
          const newCandle: CandleData = {
            time: nextTime,
            open: parseFloat(newOpen.toFixed(6)),
            close: parseFloat(newClose.toFixed(6)),
            high: parseFloat(high.toFixed(6)),
            low: parseFloat(low.toFixed(6)),
            body: [Math.min(newOpen, newClose), Math.max(newOpen, newClose)],
            wick: [low, high],
            isUp: newClose >= newOpen,
            volume: Math.floor(Math.random() * 80000 + 10000),
          };
          
          return [...prev.slice(1), newCandle];
        } else {
          // Update the current last candle
          const updated = [...prev];
          const lastCandle = { ...updated[updated.length - 1] };
          
          const variance = (Math.random() - 0.5) * 0.0004 * activeToken.price;
          const livePrice = parseFloat((activeToken.price + variance).toFixed(6));
          
          lastCandle.close = livePrice;
          lastCandle.high = parseFloat(Math.max(lastCandle.high, livePrice).toFixed(6));
          lastCandle.low = parseFloat(Math.min(lastCandle.low, livePrice).toFixed(6));
          lastCandle.body = [Math.min(lastCandle.open, livePrice), Math.max(lastCandle.open, livePrice)];
          lastCandle.wick = [lastCandle.low, lastCandle.high];
          lastCandle.isUp = lastCandle.close >= lastCandle.open;
          
          updated[updated.length - 1] = lastCandle;
          return updated;
        }
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [activeToken]);

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

  // Quick leverage preset triggers
  const setLeveragePreset = (val: number) => {
    setCustomLeverage(val.toString());
  };

  const estLiquidation = activeToken ? calculateLiquidationPrice('LONG', activeToken.price, parsedLeverage) : 0;
  const estLiquidationShort = activeToken ? calculateLiquidationPrice('SHORT', activeToken.price, parsedLeverage) : 0;

  // Find minimum and maximum price across all candles to bound Y-axis perfectly
  const getChartYDomain = () => {
    if (chartData.length === 0) return ['auto', 'auto'];
    let min = Infinity;
    let max = -Infinity;
    chartData.forEach(candle => {
      if (candle.low < min) min = candle.low;
      if (candle.high > max) max = candle.high;
    });
    // Add 8% padding to prevent candlesticks from hugging the chart ceiling/floor
    const padding = (max - min) * 0.08 || 0.000001;
    return [min - padding, max + padding];
  };

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
      <div className="col-span-12 bg-bg-dark rounded-xl border border-border-dark px-4 py-3 flex flex-wrap justify-between items-center gap-4 text-xs font-mono" id="live-ticker-banner">
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 justify-end max-w-2xl">
          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">24h Change</span>
            <span className={`text-xs font-bold ${activeToken.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {activeToken.change24h >= 0 ? '+' : ''}{activeToken.change24h.toFixed(2)}%
            </span>
          </div>
          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">24h High</span>
            <span className="text-xs text-white">${(activeToken.price * 1.05).toFixed(6)}</span>
          </div>
          <div className="text-right">
            <span className="text-gray-400 block text-[10px]">24h Low</span>
            <span className="text-xs text-white">${(activeToken.price * 0.95).toFixed(6)}</span>
          </div>
          <div className="text-right hidden sm:block">
            <span className="text-gray-400 block text-[10px]">Funding Rate</span>
            <span className="text-xs text-kaspa font-bold">0.0001% / hr</span>
          </div>
        </div>
      </div>

      {/* LEFT PORTION: Chart & Positions (Col Span 8) */}
      <div className="lg:col-span-8 flex flex-col gap-5">
        
        {/* Real-time Recharts Chart */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-4 shadow-lg flex flex-col h-[350px] relative" id="trading-chart-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-kaspa animate-pulse" />
              <h3 className="font-display font-bold text-sm text-white">{activeToken.symbol} Live Price Feed</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-bg-darker px-2.5 py-1 rounded text-[10px] font-mono text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isKdxConnected ? 'KDX Stream: Connected' : 'Standard Oracle connected'}</span>
            </div>
          </div>

          <div className="flex-1 w-full" id="responsive-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap="-100%" margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-dark)" opacity={0.25} />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={9} tickLine={false} />
                <YAxis 
                  domain={getChartYDomain()} 
                  stroke="#6b7280" 
                  fontSize={9} 
                  tickLine={false} 
                  tickFormatter={(val) => typeof val === 'number' ? val.toFixed(6) : val}
                />
                <Tooltip content={<CandlestickTooltip />} />
                {/* Wick Bar (low to high range, thin width) */}
                <Bar dataKey="wick" barSize={1.5}>
                  {chartData.map((entry, index) => (
                    <Cell key={`wick-${index}`} fill={entry.isUp ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
                {/* Body Bar (open to close range, wider width) */}
                <Bar dataKey="body" barSize={7}>
                  {chartData.map((entry, index) => (
                    <Cell key={`body-${index}`} fill={entry.isUp ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
            
            <div className="flex items-center gap-1.5 bg-bg-darker px-2 py-0.5 rounded border border-border-dark">
              <span className={`w-1.5 h-1.5 rounded-full ${isWalletConnected ? 'bg-kaspa' : 'bg-gray-600'}`} />
              <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">{activeChain}</span>
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
                <span>Select Collateral (KAS)</span>
                <span>Balance: Simulated</span>
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
                  { value: 1000, label: '1,000x', desc: 'Standard Tier', fee: '5.0%', feeColor: 'text-amber-400 bg-amber-950/20 border-amber-900/30' },
                  { value: 10000, label: '10,000x', desc: 'Premium Tier', fee: '1.0%', feeColor: 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' },
                  { value: 100000, label: '100,000x', desc: 'Pro Tier', fee: '2.0%', feeColor: 'text-cyan-400 bg-cyan-950/20 border-cyan-900/30' },
                  { value: 1000000, label: '1,000,000x', desc: 'Ultimate Tier', fee: '5.0%', feeColor: 'text-rose-400 bg-rose-950/20 border-rose-900/30' },
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

            {/* Live Fee Details and Liquidation Estimate */}
            <div className="bg-bg-darker p-3 rounded-lg border border-border-dark space-y-2 text-[11px] font-mono text-gray-400">
              <div className="flex justify-between">
                <span>Protocol Transaction Fee ({currentFeePercent}%):</span>
                <span className="text-white font-semibold">{totalOpenFee.toFixed(2)} KAS</span>
              </div>
              <div className="flex justify-between">
                <span>Position size:</span>
                <span className="text-white font-semibold">{(rawSizeKAS).toLocaleString()} KAS</span>
              </div>
              <div className="flex justify-between">
                <span>Long Liquidation Estimate:</span>
                <span className="text-amber-400 font-semibold">${estLiquidation.toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span>Short Liquidation Estimate:</span>
                <span className="text-amber-400 font-semibold">${estLiquidationShort.toFixed(6)}</span>
              </div>
              
              {parsedLeverage >= 10000 && (
                <div className="flex gap-2 bg-amber-500/5 text-amber-300/90 p-2.5 rounded-lg border border-amber-500/10 text-[10px] mt-2">
                  <HelpCircle className="w-4 h-4 shrink-0 text-amber-400/90" />
                  <span>Higher leverage multiplies risk as well as returns. Small market changes can result in rapid liquidation. Maintain sufficient collateral!</span>
                </div>
              )}
            </div>

            {/* Fast Execution Mode toggle */}
            <label className="flex items-center gap-2 cursor-pointer bg-bg-darker/60 p-2 rounded border border-border-dark/60 select-none">
              <input
                id="instant-signature-toggle"
                type="checkbox"
                checked={useInstantSignature}
                onChange={(e) => setUseInstantSignature(e.target.checked)}
                className="accent-kaspa w-3.5 h-3.5 rounded"
              />
              <div className="text-[10px] font-mono leading-tight">
                <span className="text-white block font-bold">Enable Fast Execution Mode</span>
                <span className="text-gray-400">Performs client signatures locally to execute trades instantly.</span>
              </div>
            </label>

            {/* OPEN POSITIONS EXECUTION ACTIONS */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                id="order-open-long-btn"
                onClick={() => onOpenPosition('LONG', parsedLeverage, collateralNum)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col items-center gap-0.5 border border-emerald-500/20"
              >
                <TrendingUp className="w-4.5 h-4.5 text-emerald-200" />
                <span className="text-[12px] font-black tracking-wide">BUY / LONG</span>
                <span className="text-[9px] opacity-80 font-mono font-medium">Fee: {currentFeePercent}%</span>
              </button>

              <button
                id="order-open-short-btn"
                onClick={() => onOpenPosition('SHORT', parsedLeverage, collateralNum)}
                className="bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col items-center gap-0.5 border border-rose-500/20"
              >
                <TrendingDown className="w-4.5 h-4.5 text-rose-200" />
                <span className="text-[12px] font-black tracking-wide">SELL / SHORT</span>
                <span className="text-[9px] opacity-80 font-mono font-medium">Fee: {currentFeePercent}%</span>
              </button>
            </div>
          </div>
        </div>

        {/* ORDER BOOK SECTION */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-4 shadow-lg space-y-3" id="order-book-card">
          <div className="flex justify-between items-center border-b border-border-dark pb-2">
            <h3 className="font-display font-bold text-xs text-white uppercase tracking-wider">Order Book (Simulated)</h3>
            <span className="text-[10px] text-gray-400 font-mono">Spread: 0.05%</span>
          </div>

          <div className="space-y-1 text-[11px] font-mono">
            {/* Ask Stack (Sell orders) - Red */}
            <div className="space-y-0.5">
              {asks.map((ask, idx) => (
                <div key={idx} className="flex justify-between text-red-400 relative h-5 items-center px-1 overflow-hidden">
                  <div className="absolute right-0 top-0 bottom-0 bg-red-500/5" style={{ width: `${Math.min(100, (ask.total / 500000) * 100)}%` }} />
                  <span className="z-10 font-bold">${ask.price.toFixed(6)}</span>
                  <span className="z-10 text-gray-300">{ask.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="z-10 text-gray-500">{ask.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>

            {/* Mid Price */}
            <div className="text-center py-1 bg-bg-darker border-y border-border-dark text-white font-bold my-1 text-xs">
              ${activeToken.price.toFixed(6)} <span className="text-emerald-400">↑</span>
            </div>

            {/* Bid Stack (Buy orders) - Green */}
            <div className="space-y-0.5">
              {bids.map((bid, idx) => (
                <div key={idx} className="flex justify-between text-emerald-400 relative h-5 items-center px-1 overflow-hidden">
                  <div className="absolute right-0 top-0 bottom-0 bg-emerald-500/5" style={{ width: `${Math.min(100, (bid.total / 500000) * 100)}%` }} />
                  <span className="z-10 font-bold">${bid.price.toFixed(6)}</span>
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

    </div>
  );
}
