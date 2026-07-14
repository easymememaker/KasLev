/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Cpu, Play, Trash2, Sliders, AlertCircle, RefreshCw, CheckCircle2,
  Bot, Radio, Terminal, Settings, ArrowRight, ArrowUpRight, Zap, 
  Shield, HelpCircle, Key, Landmark, Activity, Sparkles, LogOut, ArrowRightLeft
} from 'lucide-react';
import { AutomatedStrategy, Token } from '../types';

interface StrategyBuilderProps {
  tokens: Token[];
  strategies: AutomatedStrategy[];
  onCreateStrategy: (strategy: AutomatedStrategy) => void;
  onRemoveStrategy: (id: string) => void;

  // AI Agent Props
  isAiTradeAgentActive: boolean;
  setIsAiTradeAgentActive: (val: boolean) => void;
  aiTradeAgentSettings: {
    riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'DEGEN';
    triggerFrequencySec: number;
    customPrompt: string;
  };
  setAiTradeAgentSettings: React.Dispatch<React.SetStateAction<{
    riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'DEGEN';
    triggerFrequencySec: number;
    customPrompt: string;
  }>>;
  aiAgentLogs: string[];
  setAiAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  aiCountdown: number;
  isAiLoading: boolean;
  triggerAiAgentTick: () => Promise<void>;

  // Bridge props
  activeChain: 'L1' | 'L2_IGRA' | 'L2_SPARKLE' | 'L2_KASPLEX';
  userL1Address: string;
  userL2Address: string;
  onBridgeTransfer: (direction: 'L1_TO_L2' | 'L2_TO_L1', amount: number, tokenSymbol: string) => void;
}

export default function StrategyBuilder({
  tokens,
  strategies,
  onCreateStrategy,
  onRemoveStrategy,
  isAiTradeAgentActive,
  setIsAiTradeAgentActive,
  aiTradeAgentSettings,
  setAiTradeAgentSettings,
  aiAgentLogs,
  setAiAgentLogs,
  aiCountdown,
  isAiLoading,
  triggerAiAgentTick,
  activeChain,
  userL1Address,
  userL2Address,
  onBridgeTransfer,
}: StrategyBuilderProps) {
  // Navigation for inner strategy center
  const [innerTab, setInnerTab] = useState<'CLASSIC' | 'AI_AGENT' | 'BRIDGE_STATUS'>('AI_AGENT');

  // Classic Form State
  const [selectedSymbol, setSelectedSymbol] = useState(tokens[0]?.symbol || 'KAS');
  const [strategyType, setStrategyType] = useState<'TAKE_PROFIT' | 'STOP_LOSS' | 'GRID'>('TAKE_PROFIT');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [actionPercent, setActionPercent] = useState('100');
  const [status, setStatus] = useState<string | null>(null);

  // Inner Bridge state
  const [bridgeAmt, setBridgeAmt] = useState('');
  const [bridgeTok, setBridgeTok] = useState('KAS');

  const selectedToken = tokens.find((t) => t.symbol === selectedSymbol) || tokens[0];
  const currentPrice = selectedToken ? selectedToken.price : 0.15420;

  const handleClassicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerPrice || isNaN(parseFloat(triggerPrice)) || parseFloat(triggerPrice) <= 0) {
      setStatus('Please specify a valid trigger price.');
      return;
    }

    const newStrat: AutomatedStrategy = {
      id: `strat-${Math.random().toString(36).substring(2, 9)}`,
      symbol: selectedSymbol,
      type: strategyType,
      triggerPrice: parseFloat(triggerPrice),
      actionPercent: parseInt(actionPercent) || 100,
      isActive: true,
      status: 'PENDING',
    };

    onCreateStrategy(newStrat);
    setTriggerPrice('');
    setStatus(`Successfully deployed classic automated ${strategyType.replace('_', ' ')} bot for ${selectedSymbol}!`);
    setTimeout(() => setStatus(null), 4000);
  };

  const autoFillPercentage = (percent: number) => {
    if (!currentPrice) return;
    const factor = percent / 100;
    const computed = strategyType === 'TAKE_PROFIT' 
      ? currentPrice * (1 + factor) 
      : currentPrice * (1 - factor);
    setTriggerPrice(computed.toFixed(6));
  };

  const getRiskColor = (risk: typeof aiTradeAgentSettings.riskProfile) => {
    switch (risk) {
      case 'CONSERVATIVE': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'MODERATE': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'DEGEN': return 'text-red-400 bg-red-500/10 border-red-500/20';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6" id="strategy-tab-content">
      
      {/* INNER TAB SELECTOR HEADER */}
      <div className="flex flex-wrap justify-between items-center bg-bg-dark border border-border-dark p-2 rounded-xl gap-2">
        <div className="flex items-center gap-1 bg-bg-darker p-1 rounded-lg border border-border-dark max-w-full overflow-x-auto scrollbar-none">
          {[
            { id: 'AI_AGENT', label: 'Autonomous AI Agent', icon: Bot },
            { id: 'CLASSIC', label: 'Classic Grid & Triggers', icon: Sliders },
            { id: 'BRIDGE_STATUS', label: 'L2 Bridge & Gas', icon: Radio },
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = innerTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setInnerTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  isTabActive
                    ? 'bg-kaspa text-bg-darker font-black shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-bg-card'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-mono text-gray-400 px-3 py-1.5 bg-bg-darker rounded-lg border border-border-dark flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <Activity className="w-3 h-3 text-kaspa animate-pulse" />
          <span>Oracle Sync: <span className="text-kaspa font-bold">L1/L2 Active</span></span>
        </span>
      </div>

      {/* RENDER INNER ACTIVE PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ======================= TAB 1: AI AUTONOMOUS TRADING AGENT ======================= */}
        {innerTab === 'AI_AGENT' && (
          <>
            {/* Left AI Setup Panel (Col Span 5) */}
            <div className="lg:col-span-5 bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-5 h-fit flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Bot className="text-kaspa w-5.5 h-5.5" />
                    <h3 className="font-display font-black text-lg text-white">Gemini Autonomous Perps Bot</h3>
                    <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      PAPER TRADING
                    </span>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${isAiTradeAgentActive ? 'bg-kaspa animate-ping' : 'bg-gray-600'}`} />
                </div>

                <p className="text-xs text-gray-300 leading-relaxed font-sans">
                  The AI agent analyses live prices and simulates leverage entries. For your safety it is
                  <span className="text-amber-400 font-semibold"> paper-trading only</span> — it never signs a real
                  transaction or spends wallet funds. Live autonomous trading will use a dedicated, capped bot wallet.
                </p>

                {/* Switcher toggle */}
                <div className="bg-bg-darker p-4 rounded-xl border border-border-dark flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-white block">Bot Operational State</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {isAiTradeAgentActive 
                        ? `Ticking every ${aiTradeAgentSettings.triggerFrequencySec}s • Next tick: ${aiCountdown}s` 
                        : 'Agent asleep (Passive monitoring)'
                      }
                    </span>
                  </div>
                  <button
                    onClick={() => setIsAiTradeAgentActive(!isAiTradeAgentActive)}
                    className={`px-4 py-2 rounded font-mono font-black text-xs transition-all border cursor-pointer uppercase ${
                      isAiTradeAgentActive
                        ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                        : 'bg-kaspa text-bg-darker border-kaspa hover:bg-kaspa-light'
                    }`}
                  >
                    {isAiTradeAgentActive ? 'Deactivate' : 'Activate AI'}
                  </button>
                </div>

                {/* Settings Block */}
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-mono text-gray-400 mb-1">Degen Risk Threshold Profile</label>
                    <div className="grid grid-cols-3 gap-1 bg-bg-darker p-1 rounded border border-border-dark">
                      {(['CONSERVATIVE', 'MODERATE', 'DEGEN'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setAiTradeAgentSettings(prev => ({ ...prev, riskProfile: r }))}
                          className={`py-1.5 text-[10px] rounded transition-all font-mono font-bold uppercase cursor-pointer ${
                            aiTradeAgentSettings.riskProfile === r
                              ? 'bg-kaspa text-bg-darker font-black'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-gray-400">Analysis Sweep Frequency</span>
                      <span className="text-white font-bold">{aiTradeAgentSettings.triggerFrequencySec} Seconds</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="120"
                      step="5"
                      value={aiTradeAgentSettings.triggerFrequencySec}
                      onChange={(e) => setAiTradeAgentSettings(prev => ({ ...prev, triggerFrequencySec: parseInt(e.target.value) }))}
                      className="w-full accent-kaspa bg-bg-darker h-1.5 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-gray-400 mb-1">Autonomous Strategy Directive (AI Prompt)</label>
                    <textarea
                      value={aiTradeAgentSettings.customPrompt}
                      onChange={(e) => setAiTradeAgentSettings(prev => ({ ...prev, customPrompt: e.target.value }))}
                      rows={3}
                      placeholder="Input custom parameters for Gemini: e.g. trade volatile breakouts with low size..."
                      className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded-lg p-2.5 text-xs text-white leading-relaxed font-sans"
                    />
                  </div>
                </div>
              </div>

              {/* Instant Tick Trigger */}
              <button
                onClick={triggerAiAgentTick}
                disabled={isAiLoading}
                className={`w-full py-2.5 px-4 rounded-xl font-mono font-black text-xs transition-all flex items-center justify-center gap-2 border cursor-pointer mt-4 ${
                  isAiLoading
                    ? 'bg-bg-darker border-border-dark text-gray-500 cursor-not-allowed'
                    : 'bg-kaspa border-kaspa text-bg-darker hover:bg-kaspa-light shadow-lg'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : 'hover:rotate-180 transition-transform duration-300'}`} />
                <span>{isAiLoading ? 'Gemini Parsing Market...' : 'Run Manual AI Trade Scan'}</span>
              </button>
            </div>

            {/* Right Telemetry Logs Console (Col Span 7) */}
            <div className="lg:col-span-7 bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg flex flex-col min-h-[420px]">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="text-kaspa w-5 h-5 animate-pulse" />
                  <h3 className="font-display font-bold text-base text-white">AI Agent Terminal Telemetry</h3>
                </div>
                <button
                  onClick={() => setAiAgentLogs(['🤖 System cleared by user.', '🤖 Awaiting next manual/automatic scan...'])}
                  className="text-[10px] text-gray-400 hover:text-red-400 font-mono transition-colors"
                >
                  Clear Console
                </button>
              </div>

              {/* Scrolling Terminal Code lines */}
              <div className="flex-1 bg-black/80 rounded-xl p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto max-h-[350px] space-y-2 border border-border-dark">
                {aiAgentLogs.map((log, idx) => {
                  let textStyle = 'text-emerald-400';
                  if (log.includes('⚠️') || log.includes('Failed')) textStyle = 'text-red-400 font-bold';
                  if (log.includes('🔍') || log.includes('Forecast')) textStyle = 'text-sky-300';
                  if (log.includes('🚀') || log.includes('Decision')) textStyle = 'text-kaspa font-bold';
                  return (
                    <div key={idx} className={`${textStyle} leading-relaxed break-words`}>
                      <span className="text-gray-500 mr-2">&gt;</span>
                      {log}
                    </div>
                  );
                })}
              </div>

              {/* Status footer bar */}
              <div className="mt-3 bg-bg-darker border border-border-dark p-2.5 rounded-lg flex justify-between items-center text-[10px] font-mono text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-kaspa" />
                  Risk Level:{' '}
                  <span className={`px-1.5 py-0.5 rounded border ${getRiskColor(aiTradeAgentSettings.riskProfile)}`}>
                    {aiTradeAgentSettings.riskProfile}
                  </span>
                </span>
                <span>Active Network: <span className="text-kaspa font-bold">{activeChain}</span></span>
              </div>
            </div>
          </>
        )}

        {/* ======================= TAB 2: CLASSIC AUTOMATED STRATEGIES ======================= */}
        {innerTab === 'CLASSIC' && (
          <>
            {/* Strategy Creation Panel (Col Span 5) */}
            <div className="lg:col-span-5 bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-4 h-fit">
              <div className="flex items-center gap-2.5">
                <Sliders className="text-kaspa w-5 h-5 animate-pulse" />
                <h3 className="font-display font-bold text-lg text-white">Grid Triggers & Limit Orders</h3>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed font-sans">
                Configure standard algorithmic conditional triggers. Instructions run locally with ultra-low latency propagation immediately upon block target updates.
              </p>

              <form onSubmit={handleClassicSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">Target Asset</label>
                  <select
                    id="strategy-asset-select"
                    value={selectedSymbol}
                    onChange={(e) => {
                      setSelectedSymbol(e.target.value);
                      setTriggerPrice('');
                    }}
                    className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {tokens.map((t) => (
                      <option key={t.id} value={t.symbol}>
                        {t.symbol} ({t.name}) - Current: ${t.price.toFixed(5)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">Strategy Trigger Mechanism</label>
                  <div className="grid grid-cols-3 gap-1 bg-bg-darker p-1 rounded border border-border-dark">
                    {[
                      { type: 'TAKE_PROFIT', label: 'Take Profit' },
                      { type: 'STOP_LOSS', label: 'Stop Loss' },
                      { type: 'GRID', label: 'Grid Trade' },
                    ].map((opt) => (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => {
                          setStrategyType(opt.type as any);
                          setTriggerPrice('');
                        }}
                        className={`py-1.5 text-[11px] rounded transition-all font-mono font-medium cursor-pointer ${
                          strategyType === opt.type
                            ? 'bg-kaspa text-bg-darker font-bold'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-mono text-gray-400">Trigger Target Price ($)</label>
                    <div className="flex gap-1.5 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => autoFillPercentage(5)}
                        className="text-kaspa hover:underline cursor-pointer"
                      >
                        {strategyType === 'TAKE_PROFIT' ? '+5%' : '-5%'}
                      </button>
                      <button
                        type="button"
                        onClick={() => autoFillPercentage(15)}
                        className="text-kaspa hover:underline cursor-pointer"
                      >
                        {strategyType === 'TAKE_PROFIT' ? '+15%' : '-15%'}
                      </button>
                      <button
                        type="button"
                        onClick={() => autoFillPercentage(50)}
                        className="text-kaspa hover:underline cursor-pointer"
                      >
                        {strategyType === 'TAKE_PROFIT' ? '+50%' : '-50%'}
                      </button>
                    </div>
                  </div>
                  <input
                    id="strategy-trigger-price"
                    type="number"
                    step="0.000001"
                    placeholder={currentPrice.toFixed(6)}
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">Action Size (% of Active Margin)</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {['25', '50', '75', '100'].map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => setActionPercent(percent)}
                        className={`py-1 rounded border text-xs font-mono transition-all cursor-pointer ${
                          actionPercent === percent
                            ? 'bg-kaspa border-kaspa text-bg-darker font-bold'
                            : 'bg-bg-darker border-border-dark text-gray-300 hover:text-white'
                        }`}
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                </div>

                {status && (
                  <div className="p-3 bg-kaspa-dark/20 border border-kaspa/30 rounded text-xs text-kaspa flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{status}</span>
                  </div>
                )}

                <button
                  id="strategy-submit-btn"
                  type="submit"
                  className="w-full bg-kaspa hover:bg-kaspa-light text-bg-darker font-display font-bold text-xs py-2 px-4 rounded transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Initialize Algorithmic Trigger
                </button>
              </form>
            </div>

            {/* Active Strategies Listing (Col Span 7) */}
            <div className="lg:col-span-7 bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg flex flex-col min-h-[350px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sliders className="text-kaspa w-5 h-5" />
                  <h3 className="font-display font-bold text-lg text-white">Active Automations</h3>
                </div>
                <span className="text-[10px] bg-bg-darker text-kaspa border border-kaspa/20 px-2 py-0.5 rounded font-mono">
                  Trigger Execution Speed: 0.1s
                </span>
              </div>

              {strategies.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-bg-darker rounded-xl border border-dashed border-border-dark">
                  <Cpu className="text-gray-600 w-12 h-12 mb-3 stroke-1" />
                  <p className="text-sm font-semibold text-white">No active triggers detected</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm font-sans">
                    Use the builder on the left to deploy automated grid bots that execute instantly upon price boundaries.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[400px] flex-1">
                  {strategies.map((strat) => {
                    const tokenInfo = tokens.find((t) => t.symbol === strat.symbol);
                    const isBelow = (tokenInfo?.price || 0) < strat.triggerPrice;
                    const isTakeProfit = strat.type === 'TAKE_PROFIT';

                    return (
                      <div
                        key={strat.id}
                        id={`strategy-row-${strat.id}`}
                        className="bg-bg-darker p-4 rounded-xl border border-border-dark hover:border-gray-700 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-kaspa-dark/50 text-kaspa border border-kaspa/10 px-2 py-0.5 rounded font-mono font-bold">
                              {strat.type.replace('_', ' ')}
                            </span>
                            <span className="font-display font-bold text-sm text-white">{strat.symbol}</span>
                          </div>
                          <div className="text-xs text-gray-300">
                            Trigger at Price:{' '}
                            <span className="font-mono text-white font-bold">${strat.triggerPrice.toFixed(6)}</span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            Action size: {strat.actionPercent}% position • Status:{' '}
                            <span className={strat.status === 'TRIGGERED' ? 'text-emerald-400' : 'text-amber-400'}>
                              {strat.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                          <div className="text-right">
                            <span className="text-[10px] text-gray-400 block font-mono">Live Asset Price</span>
                            <span className="text-xs font-mono font-bold text-white">${tokenInfo?.price.toFixed(6)}</span>
                          </div>

                          <button
                            id={`delete-strategy-${strat.id}`}
                            onClick={() => onRemoveStrategy(strat.id)}
                            className="text-gray-400 hover:text-red-400 p-2 border border-border-dark hover:border-red-500/20 rounded bg-bg-dark transition-all cursor-pointer"
                            title="Deactivate bot"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ======================= TAB 3: L2 BRIDGE STATUS & BALANCES ======================= */}
        {innerTab === 'BRIDGE_STATUS' && (
          <div className="lg:col-span-12 bg-bg-dark rounded-xl border border-border-dark p-6 shadow-lg space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-border-dark pb-4 gap-4">
              <div>
                <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                  <Radio className="text-kaspa w-5.5 h-5.5 animate-pulse" />
                  Kaspa Multi-Layer Bridge & Gas Audit
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Secure monitoring dashboard for Igra L2 Labs, Sparkle rollup consensus nodes, and Kasplex zkEVM contract addresses.
                </p>
              </div>
              <div className="flex gap-2 font-mono text-xs">
                <span className="bg-bg-darker px-3 py-1.5 border border-border-dark rounded text-gray-400">
                  L1 Speed: <span className="text-kaspa font-bold">1s BPS</span>
                </span>
                <span className="bg-bg-darker px-3 py-1.5 border border-border-dark rounded text-gray-400">
                  L2 Gas Limit: <span className="text-emerald-400 font-bold">Free EVM Gas</span>
                </span>
              </div>
            </div>

            {/* Quick stats board */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-bg-darker p-4 rounded-xl border border-border-dark space-y-1.5">
                <span className="text-[10px] text-gray-400 font-mono block">IGRA L2 (Labs) Bridge Wallet</span>
                <span className="text-xs text-white font-mono block select-all break-all">0xeA926cFcccbF5e9657C9e397FC8D80DF361538e9</span>
                <div className="flex justify-between items-center text-[10px] font-mono pt-1 text-gray-500">
                  <span>Owner: Security Dev Wallet</span>
                  <span className="text-kaspa">Gas-free Rollup</span>
                </div>
              </div>

              <div className="bg-bg-darker p-4 rounded-xl border border-border-dark space-y-1.5">
                <span className="text-[10px] text-gray-400 font-mono block">Sparkle Rollup L2 Bridge</span>
                <span className="text-xs text-white font-mono block select-all break-all">0xCcBe7Cf3472D15aAf950eF02D7067751bAE7DBb0</span>
                <div className="flex justify-between items-center text-[10px] font-mono pt-1 text-gray-500">
                  <span>Owner: Platform Protocol Vault</span>
                  <span className="text-kaspa font-bold">ZKP Validated</span>
                </div>
              </div>

              <div className="bg-bg-darker p-4 rounded-xl border border-border-dark space-y-1.5">
                <span className="text-[10px] text-gray-400 font-mono block">Active Chain Network</span>
                <span className="text-sm text-kaspa font-bold block">{activeChain === 'L1' ? 'Kaspa L1 Mainnet' : `${activeChain} active layer`}</span>
                <div className="flex justify-between items-center text-[10px] font-mono pt-1 text-gray-500">
                  <span>User L1 Wallet: {userL1Address.slice(0, 10)}...</span>
                  <span className="text-white font-bold">Connected</span>
                </div>
              </div>
            </div>

            {/* Interactive Bridge Fast Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="bg-bg-darker p-5 rounded-xl border border-border-dark space-y-4">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="text-kaspa w-4.5 h-4.5" />
                  <span className="text-sm font-display font-bold text-white">Instant Gas Deposit & Bridge Form</span>
                </div>
                
                <p className="text-xs text-gray-400">
                  Deposit KAS directly from Kaspa L1 to the platform L2 rollup bridge with zero delays and cryptographic proof security.
                </p>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-gray-400 mb-1">Deposit Amount</label>
                      <input
                        type="number"
                        placeholder="100"
                        value={bridgeAmt}
                        onChange={(e) => setBridgeAmt(e.target.value)}
                        className="w-full bg-bg-dark border border-border-dark focus:border-kaspa focus:outline-none rounded p-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-gray-400 mb-1">Asset Token</label>
                      <select
                        value={bridgeTok}
                        onChange={(e) => setBridgeTok(e.target.value)}
                        className="w-full bg-bg-dark border border-border-dark focus:border-kaspa focus:outline-none rounded p-2 text-xs text-white font-mono"
                      >
                        <option value="KAS">KAS (Kaspa)</option>
                        <option value="NACHO">NACHO</option>
                        <option value="KASPY">KASPY</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const amt = parseFloat(bridgeAmt);
                      if (amt > 0) {
                        onBridgeTransfer('L1_TO_L2', amt, bridgeTok);
                        setBridgeAmt('');
                      }
                    }}
                    className="w-full bg-kaspa hover:bg-kaspa-light text-bg-darker py-2 rounded font-mono font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Execute Deposit To L2 Platform Bridge</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-bg-darker p-5 rounded-xl border border-border-dark space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="text-kaspa w-4.5 h-4.5" />
                    <span className="text-sm font-display font-bold text-white">Rollup Security & EVM Contracts</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed font-sans">
                    Kaspa’s L2 framework operates under a zero-gas EVM bridge structure. Transactions submitted to Igra Labs or Sparkle Rollups are locked securely in the Platform contract and then compressed using zero-knowledge cryptographic proofs before settling back to L1.
                  </p>
                </div>
                <div className="space-y-1 bg-bg-dark border border-border-dark p-2.5 rounded-lg text-[10px] font-mono">
                  <div className="flex justify-between text-gray-400">
                    <span>L1 Security Anchor:</span>
                    <span className="text-white">Active</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Kasplex zkEVM Compiler:</span>
                    <span className="text-white">v0.8.24</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Proof of Volatility Consensus:</span>
                    <span className="text-kaspa font-bold">100% Synced</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
