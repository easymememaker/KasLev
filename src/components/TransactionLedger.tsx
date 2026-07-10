import React, { useState } from 'react';
import { 
  Radio, 
  Copy, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Database, 
  CheckCircle2, 
  Clock,
  Code
} from 'lucide-react';
import { TradeHistoryItem, LiquidityPool } from '../types';
import { DEV_WALLET, USER_WALLET, VAULT_ADDRESS, generateTxId } from '../App';

interface TransactionLedgerProps {
  tradeHistory: TradeHistoryItem[];
  pool: LiquidityPool;
  triggerAlert: (type: 'success' | 'error' | 'info', text: string) => void;
}

export default function TransactionLedger({
  tradeHistory,
  pool,
  triggerAlert
}: TransactionLedgerProps) {
  const [filter, setFilter] = useState<'ALL' | 'TRADING' | 'POOL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            triggerAlert('success', `Copied ${label} to clipboard: ${text.substring(0, 15)}...`);
          })
          .catch(() => {
            fallbackCopy(text, label);
          });
      } else {
        fallbackCopy(text, label);
      }
    } catch (e) {
      fallbackCopy(text, label);
    }
  };

  const fallbackCopy = (text: string, label: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        triggerAlert('success', `Copied ${label} to clipboard: ${text.substring(0, 15)}...`);
      } else {
        triggerAlert('error', `Could not copy ${label}. Please copy manually.`);
      }
    } catch (err) {
      triggerAlert('error', `Could not copy ${label}. Please copy manually.`);
    }
    document.body.removeChild(textArea);
  };

  const filteredHistory = tradeHistory.filter((item) => {
    // 1. Filter by category
    if (filter === 'TRADING' && (item.type === 'POOL' || item.type === 'SYSTEM')) return false;
    if (filter === 'POOL' && item.type !== 'POOL') return false;

    // 2. Search term
    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      const symbolMatch = item.symbol.toLowerCase().includes(query);
      const actionMatch = item.action.toLowerCase().includes(query);
      const txMatch = item.txId?.toLowerCase().includes(query) || false;
      const fromMatch = item.fromAddress?.toLowerCase().includes(query) || false;
      const toMatch = item.toAddress?.toLowerCase().includes(query) || false;
      
      return symbolMatch || actionMatch || txMatch || fromMatch || toMatch;
    }

    return true;
  });

  const getMethodBadge = (action: string) => {
    switch (action) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 text-[10px] font-bold">
            <ArrowUpRight className="w-3 h-3 text-emerald-400" />
            MARGIN_OPEN
          </span>
        );
      case 'CLOSE':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 text-[10px] font-bold">
            <ArrowDownLeft className="w-3 h-3 text-amber-400" />
            MARGIN_CLOSE
          </span>
        );
      case 'LIQUIDATION':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 text-[10px] font-bold animate-pulse">
            ☠ LIQUIDATION
          </span>
        );
      case 'LOCK':
        return (
          <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 text-[10px] font-bold">
            🔐 CONTRACT_LOCK
          </span>
        );
      case 'DEPOSIT':
        return (
          <span className="inline-flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 text-[10px] font-bold">
            📥 POOL_DEPOSIT
          </span>
        );
      case 'WITHDRAW':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded border border-rose-500/20 text-[10px] font-bold">
            💸 POOL_WITHDRAW
          </span>
        );
      default:
        return (
          <span className="bg-gray-500/10 text-gray-400 px-2 py-0.5 rounded border border-gray-500/20 text-[10px] font-bold">
            {action}
          </span>
        );
    }
  };

  const formatAddress = (addr?: string) => {
    if (!addr) return 'Unknown';
    if (addr === DEV_WALLET) return 'Dev Protocol Wallet';
    if (addr === USER_WALLET) return 'My Active Wallet';
    if (addr === VAULT_ADDRESS) return 'Liquidity Vault';
    return `${addr.substring(0, 11)}...${addr.substring(addr.length - 6)}`;
  };

  return (
    <section className="max-w-7xl mx-auto px-4 mt-8" id="trade-history-analytics">
      <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg relative overflow-hidden">
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-[0.1] pointer-events-none" />

        {/* TOP BAR */}
        <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center border-b border-border-dark pb-4 mb-5 gap-4">
          <div className="space-y-1">
            <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 uppercase tracking-wide">
              <Radio className="text-kaspa w-4.5 h-4.5 animate-pulse" />
              Kaspa Node Live Activity Audit Ledger
            </h3>
            <p className="text-xs text-gray-400 font-sans">
              Decentralized, non-custodial block-explorer trace of open positions, fees routing, and pool contract operations.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-3 text-[10px] font-mono">
            <div className="bg-bg-darker/80 backdrop-blur-md px-3 py-1.5 rounded border border-border-dark flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-kaspa" />
              <span className="text-gray-400">Total Vault:</span>
              <span className="text-white font-bold">{(pool.totalKAS).toLocaleString()} KAS</span>
            </div>
            <div className="bg-bg-darker/80 backdrop-blur-md px-3 py-1.5 rounded border border-border-dark flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-gray-400">Dev Lock-up:</span>
              <span className="text-white font-bold">{pool.developerContribution.toLocaleString()} KAS</span>
            </div>
            <div className="bg-bg-darker/80 backdrop-blur-md px-3 py-1.5 rounded border border-border-dark flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-gray-400">Total Protocol Fees:</span>
              <span className="text-kaspa font-bold">{pool.accumulatedFees.toLocaleString(undefined, { maximumFractionDigits: 2 })} KAS</span>
            </div>
          </div>
        </div>

        {/* CONTROLS (TABS & SEARCH) */}
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          {/* Tabs */}
          <div className="flex bg-bg-darker p-0.5 rounded-lg border border-border-dark w-full md:w-auto">
            {(['ALL', 'TRADING', 'POOL'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                  filter === t
                    ? 'bg-kaspa text-bg-darker shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'ALL' ? 'All Transactions' : t === 'TRADING' ? 'Trading History' : 'System & Pool'}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search ledger (KAS, NACHO, Address, TxID)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:ring-1 focus:ring-kaspa outline-none rounded-lg py-1.5 pl-9 pr-4 text-xs font-mono text-white placeholder-gray-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-[10px] font-mono"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* LEDGER GRID / TABLE */}
        <div className="relative z-10 bg-bg-darker/40 border border-border-dark/60 rounded-xl overflow-hidden">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 px-6 flex flex-col items-center justify-center gap-2">
              <Database className="w-8 h-8 text-gray-600 animate-pulse" />
              <p className="text-xs text-gray-400 font-mono">No matching ledger records found.</p>
              <p className="text-[10px] text-gray-500 font-mono">Open a long/short leverage position above to write dynamic state transactions.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs select-none">
                <thead>
                  <tr className="bg-bg-darker border-b border-border-dark text-[10px] text-gray-400 uppercase tracking-wider h-9">
                    <th className="pl-4 font-bold">Block / Time</th>
                    <th className="font-bold">Transaction Hash</th>
                    <th className="font-bold">Contract Method</th>
                    <th className="font-bold">Party Flow (From / To)</th>
                    <th className="font-bold text-right">Size / Rate</th>
                    <th className="font-bold text-right">Fee / Net Profit</th>
                    <th className="pr-4 font-bold text-center">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark/40">
                  {filteredHistory.map((item) => {
                    const isExpanded = expandedTxId === item.id;
                    const isLong = item.type === 'LONG';
                    const isPositive = item.pnl > 0;
                    const dateStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const displayTx = item.txId ? `${item.txId.substring(0, 8)}...${item.txId.substring(58)}` : 'Internal';
                    
                    return (
                      <React.Fragment key={item.id}>
                        <tr 
                          onClick={() => setExpandedTxId(isExpanded ? null : item.id)}
                          className={`hover:bg-bg-darker/60 transition-colors cursor-pointer group ${
                            isExpanded ? 'bg-bg-darker/40' : ''
                          }`}
                        >
                          {/* Block Index & Timestamp */}
                          <td className="pl-4 py-3 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping shrink-0" />
                              <span className="text-white font-medium">{item.blueScore ? item.blueScore.toLocaleString() : '82,912,450'}</span>
                            </div>
                            <span className="text-gray-500 text-[9px] block font-sans mt-0.5">{dateStr}</span>
                          </td>

                          {/* TxID with Copy Shortcut */}
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-300 font-bold group-hover:text-kaspa transition-colors">
                                {displayTx}
                              </span>
                              {item.txId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(item.txId || '', 'Transaction Hash');
                                  }}
                                  className="p-1 hover:bg-bg-dark rounded text-gray-500 hover:text-white transition-all cursor-pointer"
                                  title="Copy Full Transaction Hash"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Method Badge */}
                          <td className="py-3">
                            {getMethodBadge(item.action)}
                          </td>

                          {/* Party Flow */}
                          <td className="py-3 text-[10px] text-gray-400">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] bg-bg-dark px-1 rounded text-gray-500">FM</span>
                                <span 
                                  className="text-gray-300 hover:underline cursor-pointer select-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.fromAddress) copyToClipboard(item.fromAddress, 'Sender Address');
                                  }}
                                >
                                  {formatAddress(item.fromAddress)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] bg-bg-dark px-1 rounded text-gray-500">TO</span>
                                <span 
                                  className="text-gray-300 hover:underline cursor-pointer select-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.toAddress) copyToClipboard(item.toAddress, 'Recipient Address');
                                  }}
                                >
                                  {formatAddress(item.toAddress)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Size / Amount */}
                          <td className="py-3 text-right">
                            {item.action === 'LOCK' || item.action === 'DEPOSIT' || item.action === 'WITHDRAW' ? (
                              <span className="text-white font-bold">
                                {item.size.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KAS
                              </span>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className={`font-bold ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {isLong ? 'Buy' : 'Sell'} {item.size.toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.symbol}
                                </span>
                                <span className="text-gray-500 text-[9px]">Rate: ${item.price.toFixed(6)}</span>
                              </div>
                            )}
                          </td>

                          {/* Fees / PnL */}
                          <td className="py-3 text-right">
                            {item.action === 'LOCK' || item.action === 'DEPOSIT' ? (
                              <span className="text-gray-500 font-semibold">-</span>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className={`font-black ${
                                  item.action === 'LIQUIDATION' 
                                    ? 'text-red-400' 
                                    : isPositive 
                                    ? 'text-emerald-400' 
                                    : item.pnl < 0 
                                    ? 'text-red-400' 
                                    : 'text-gray-300'
                                }`}>
                                  {item.action === 'LIQUIDATION' 
                                    ? `-${item.size.toLocaleString()} KAS` 
                                    : isPositive 
                                    ? `+${item.pnl.toFixed(2)} KAS` 
                                    : `${item.pnl.toFixed(2)} KAS`}
                                </span>
                                {item.fee > 0 && (
                                  <span className="text-[9px] text-gray-500 font-sans">
                                    Fee: {item.fee.toFixed(2)} KAS
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Expander Arrow */}
                          <td className="py-3 text-center pr-4">
                            <div className="flex items-center justify-center text-gray-500 group-hover:text-white transition-all">
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-kaspa" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDABLE RAW DETAILS BLOCK */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-bg-darker/60 px-5 py-4 border-t border-border-dark/30">
                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-[11px] leading-relaxed">
                                {/* Left Side: Details list */}
                                <div className="lg:col-span-5 space-y-2">
                                  <div className="flex items-center gap-1.5 text-xs text-kaspa font-bold mb-1">
                                    <Clock className="w-4.5 h-4.5" />
                                    <span>UTXO Transaction Trace Parameters</span>
                                  </div>

                                  <div className="bg-bg-dark/80 p-3 rounded-lg border border-border-dark space-y-1.5 font-mono">
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Transaction ID:</span>
                                      <span className="text-white select-all break-all text-right max-w-[200px] font-bold">
                                        {item.txId || 'Internal Blockchain Settlement'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Timestamp:</span>
                                      <span className="text-white">{new Date(item.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Block Blue Score:</span>
                                      <span className="text-white">{item.blueScore ? item.blueScore.toLocaleString() : '82,912,450'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Subnetwork Protocol:</span>
                                      <span className="text-white">WASM-Toccata-v0.14</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Signature Execution:</span>
                                      <span className="text-emerald-400 font-semibold">Decentralized sMPC Native</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Right Side: Fake JSON dump (Highly realistic "Use Design") */}
                                <div className="lg:col-span-7 space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs text-kaspa font-bold mb-1">
                                    <Code className="w-4 h-4" />
                                    <span>Protocol Trace JSON Ledger Payload</span>
                                  </div>
                                  <div className="bg-bg-darker/90 p-3 rounded-lg border border-border-dark overflow-x-auto text-[10px] text-gray-300 max-h-48 scrollbar-thin">
                                    <pre className="whitespace-pre">
{JSON.stringify({
  version: 1,
  transaction_id: item.txId || `internal-${item.id}`,
  lock_time: 0,
  subnetwork_id: "0000000000000000000000000000000000000100",
  inputs: [
    {
      previous_outpoint: {
        transaction_id: generateTxId().substring(0, 64),
        index: 0
      },
      signature_script: "30450221008f36c568...",
      sequence: 0,
      wallet_address: item.fromAddress || USER_WALLET
    }
  ],
  outputs: [
    {
      amount_kas: item.action === 'LOCK' || item.action === 'DEPOSIT' || item.action === 'WITHDRAW' ? item.size : item.fee,
      script_public_key: "2070c7b4129...",
      recipient: item.toAddress || DEV_WALLET
    },
    {
      amount_kas: item.action === 'OPEN' ? item.size * 0.15 : 0,
      script_public_key: "20pdgkr932x...",
      recipient: VAULT_ADDRESS
    }
  ],
  payload: {
    protocol: "KasLev-HighLeverage",
    action: item.action,
    token_symbol: item.symbol,
    leverage_multiplier: item.leverage,
    settlement_rate: item.price,
    net_pnl_kas: item.pnl,
    fee_bps: item.action === 'OPEN' ? 100 : 200,
    is_compiled_verifiable: true
  }
}, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
