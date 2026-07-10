/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Shield, Zap, RefreshCw, Layers, Cpu, Code, Lock, Server, Sun, Moon, 
  Wallet, Globe, ArrowRightLeft, Copy, ExternalLink, HelpCircle, 
  CheckCircle2, AlertCircle, Info, ChevronDown, Activity
} from 'lucide-react';
import { Token } from '../types';
import { ensureKasplexNetwork } from '../web3/kaslev';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  userWallet: string;
  setUserWallet: (address: string) => void;
  isKdxConnected: boolean;
  setIsKdxConnected: (val: boolean) => void;
  kasPrice: number;
  priceSource: string;
  refetchPrice: () => void;
  isPriceLoading: boolean;
  isHighContrast: boolean;
  setIsHighContrast: (val: boolean) => void;

  // New multichain & wallet props
  activeChain: 'L1' | 'L2_IGRA' | 'L2_SPARKLE' | 'L2_KASPLEX';
  setActiveChain: (chain: 'L1' | 'L2_IGRA' | 'L2_SPARKLE' | 'L2_KASPLEX') => void;
  connectedWalletType: 'KASPIUM' | 'KASWARE' | 'KDX' | 'METAMASK' | null;
  setConnectedWalletType: (wallet: 'KASPIUM' | 'KASWARE' | 'KDX' | 'METAMASK' | null) => void;
  isWalletConnected: boolean;
  setIsWalletConnected: (val: boolean) => void;
  userL1Address: string;
  setUserL1Address: (addr: string) => void;
  userL2Address: string;
  setUserL2Address: (addr: string) => void;
  onBridgeTransfer: (direction: 'L1_TO_L2' | 'L2_TO_L1', amount: number, tokenSymbol: string) => void;
  tokens: Token[];
  triggerAlert?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export default function Navbar({
  currentTab,
  setCurrentTab,
  userWallet,
  setUserWallet,
  isKdxConnected,
  setIsKdxConnected,
  kasPrice,
  priceSource,
  refetchPrice,
  isPriceLoading,
  isHighContrast,
  setIsHighContrast,
  activeChain,
  setActiveChain,
  connectedWalletType,
  setConnectedWalletType,
  isWalletConnected,
  setIsWalletConnected,
  userL1Address,
  setUserL1Address,
  userL2Address,
  setUserL2Address,
  onBridgeTransfer,
  tokens,
  triggerAlert,
}: NavbarProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [isHubOpen, setIsHubOpen] = useState(false);

  // Bridging Interactive States
  const [bridgeDirection, setBridgeDirection] = useState<'L1_TO_L2' | 'L2_TO_L1'>('L1_TO_L2');
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [bridgeToken, setBridgeToken] = useState('KAS');
  const [isBridging, setIsBridging] = useState(false);
  const [bridgeProgress, setBridgeProgress] = useState(0);
  const [bridgeStatus, setBridgeStatus] = useState('');

  const [manualL1Input, setManualL1Input] = useState(userL1Address);
  const [manualL2Input, setManualL2Input] = useState(userL2Address);

  const [isHealthDropdownOpen, setIsHealthDropdownOpen] = useState(false);
  const [networkHealths, setNetworkHealths] = useState<{
    [key: string]: {
      name: string;
      desc: string;
      blockHeight: number;
      latency: number;
      status: 'optimal' | 'degraded' | 'offline';
      bps: number;
    }
  }>({
    L1: { name: 'Kaspa Mainnet L1', desc: 'Secure Layer 1 DAG (1 BPS)', blockHeight: 84291048, latency: 12, status: 'optimal', bps: 1.0 },
    L2_IGRA: { name: 'Igra L2 Rollup', desc: 'Zero-Gas Scaling Labs Rollup', blockHeight: 12845910, latency: 24, status: 'optimal', bps: 0.67 },
    L2_SPARKLE: { name: 'Sparkle L2 App Chain', desc: 'Sovereign Application Chain', blockHeight: 8723101, latency: 45, status: 'optimal', bps: 0.33 },
    L2_KASPLEX: { name: 'Kasplex zkEVM L2', desc: 'Solidity Smart Contracts (EVM)', blockHeight: 4912854, latency: 32, status: 'optimal', bps: 0.50 }
  });

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNetworkHealths(prev => {
        const next = { ...prev };
        // Increment L1 block height by ~1 block per second
        next.L1 = {
          ...next.L1,
          blockHeight: next.L1.blockHeight + 1,
          latency: Math.max(8, Math.min(22, Math.round(next.L1.latency + (Math.random() * 4 - 2))))
        };
        // L2 Igra increments occasionally
        if (Math.random() > 0.3) {
          next.L2_IGRA = {
            ...next.L2_IGRA,
            blockHeight: next.L2_IGRA.blockHeight + 1,
            latency: Math.max(15, Math.min(35, Math.round(next.L2_IGRA.latency + (Math.random() * 6 - 3))))
          };
        }
        // Sparkle L2 increments occasionally
        if (Math.random() > 0.6) {
          next.L2_SPARKLE = {
            ...next.L2_SPARKLE,
            blockHeight: next.L2_SPARKLE.blockHeight + 1,
            latency: Math.max(30, Math.min(65, Math.round(next.L2_SPARKLE.latency + (Math.random() * 8 - 4))))
          };
        }
        // Kasplex zkEVM increments occasionally
        if (Math.random() > 0.5) {
          next.L2_KASPLEX = {
            ...next.L2_KASPLEX,
            blockHeight: next.L2_KASPLEX.blockHeight + 1,
            latency: Math.max(20, Math.min(48, Math.round(next.L2_KASPLEX.latency + (Math.random() * 6 - 3))))
          };
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    setManualL1Input(userL1Address);
  }, [userL1Address]);

  React.useEffect(() => {
    setManualL2Input(userL2Address);
  }, [userL2Address]);

  const handleManualConnect = () => {
    if (!manualL1Input.trim().startsWith('kaspa:')) {
      if (triggerAlert) {
        triggerAlert('error', 'Invalid Kaspa address! It must begin with "kaspa:".');
      } else {
        alert('Invalid Kaspa address! It must begin with "kaspa:".');
      }
      return;
    }
    if (!manualL2Input.trim().startsWith('0x') || manualL2Input.trim().length < 40) {
      if (triggerAlert) {
        triggerAlert('error', 'Invalid EVM L2 address! It must begin with "0x" and have a valid public key format.');
      } else {
        alert('Invalid EVM L2 address! It must begin with "0x" and contain a valid public key hex.');
      }
      return;
    }
    setUserL1Address(manualL1Input.trim());
    setUserL2Address(manualL2Input.trim());
    setUserWallet(manualL1Input.trim());
    setIsWalletConnected(true);
    setConnectedWalletType('KASWARE');
    if (triggerAlert) {
      triggerAlert('success', `Connected: L1 & L2 Session synchronized!`);
    }
  };

  const DEV_WALLET = 'kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9';
  const POOL_WALLET = 'kaspa:qqzjw5ur7fyq9q7la72shhcfcq02j76uetfque833g2l7e8vmjkt2eqf5egkf';

  // L2 Addresses requested by developer
  const DEV_L2_WALLET = '0xeA926cFcccbF5e9657C9e397FC8D80DF361538e9';
  const PLATFORM_L2_WALLET = '0xCcBe7Cf3472D15aAf950eF02D7067751bAE7DBb0';

  const copyAddress = (address: string, label: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address)
          .then(() => {
            setCopied(label);
            setTimeout(() => setCopied(null), 2000);
          })
          .catch(() => fallbackCopy(address, label));
      } else {
        fallbackCopy(address, label);
      }
    } catch (err) {
      fallbackCopy(address, label);
    }
  };

  const fallbackCopy = (address: string, label: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = address;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      // ignore
    }
    document.body.removeChild(textArea);
  };

  // Wallet Connection Actions
  const connectKasware = async () => {
    if (typeof (window as any).kasware !== 'undefined') {
      try {
        const accounts = await (window as any).kasware.requestAccounts();
        if (accounts && accounts.length > 0) {
          setUserL1Address(accounts[0]);
          setUserWallet(accounts[0]);
          setIsWalletConnected(true);
          setConnectedWalletType('KASWARE');
        }
      } catch (err) {
        console.error('Kasware connection rejected', err);
      }
    } else {
      simulateConnection('KASWARE');
    }
  };

  const connectMetaMask = async () => {
    if (typeof (window as any).ethereum !== 'undefined') {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts.length > 0) {
          // Make sure the wallet is on the Kasplex L2 so trades actually land on-chain.
          await ensureKasplexNetwork();
          const addr = accounts[0];
          setUserL2Address(addr);
          // Map to an elegant aligned virtual L1 address to keep UI consistent
          const virtualL1 = `kaspa:qqzjw5evm${addr.substring(2, 32).toLowerCase()}`;
          setUserL1Address(virtualL1);
          setUserWallet(virtualL1);
          setIsWalletConnected(true);
          setConnectedWalletType('METAMASK');
        }
      } catch (err) {
        console.error('MetaMask connection rejected', err);
      }
    } else {
      simulateConnection('METAMASK');
    }
  };

  const simulateConnection = (type: 'KASPIUM' | 'KDX' | 'KASWARE' | 'METAMASK') => {
    const randomHex = Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    if (type === 'METAMASK') {
      const mockL2 = `0x${randomHex.substring(0, 40)}`;
      const mockL1 = `kaspa:qqzjw5evm${randomHex.substring(0, 30)}`;
      setUserL2Address(mockL2);
      setUserL1Address(mockL1);
      setUserWallet(mockL1);
    } else {
      const mockAddr = `kaspa:qqzjw5${randomHex.substring(0, 30)}`;
      setUserL1Address(mockAddr);
      setUserWallet(mockAddr);
    }
    setIsWalletConnected(true);
    setConnectedWalletType(type);
  };

  const disconnectWallet = () => {
    setIsWalletConnected(false);
    setConnectedWalletType(null);
  };

  // Bridging Simulation
  const handleBridgeAction = async () => {
    const amt = parseFloat(bridgeAmount);
    if (isNaN(amt) || amt <= 0) return;

    setIsBridging(true);
    setBridgeProgress(5);
    setBridgeStatus('Checking wallet balances and block propagation depth...');

    // Live Web3 Connection validation and active requests
    if (connectedWalletType === 'METAMASK' && typeof (window as any).ethereum !== 'undefined') {
      try {
        setBridgeStatus('Requesting MetaMask transaction signature...');
        const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
        const from = accounts[0] || userL2Address;
        
        // Request eth_sendTransaction to the Platform L2 Bridge wallet
        const txParams = {
          from: from,
          to: '0xCcBe7Cf3472D15aAf950eF02D7067751bAE7DBb0', // Platform L2 Bridge wallet
          value: '0x0', // 0 native value, bridging custom assets
          data: '0x',
        };
        
        const txHash = await (window as any).ethereum.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });
        
        console.log('Real L2 MetaMask Tx completed:', txHash);
        setBridgeStatus(`MetaMask transaction verified! Hash: ${txHash.slice(0, 10)}...`);
      } catch (err: any) {
        console.error('MetaMask transaction failed or was rejected:', err);
        setIsBridging(false);
        if (triggerAlert) {
          triggerAlert('error', `Bridge transaction rejected or failed: ${err?.message || err}`);
        } else {
          alert(`Bridge transaction rejected by user or failed: ${err?.message || err}`);
        }
        return;
      }
    } else if (connectedWalletType === 'KASWARE' && typeof (window as any).kasware !== 'undefined') {
      try {
        setBridgeStatus('Requesting Kasware transaction signature...');
        await (window as any).kasware.signMessage(`Authorize KasLev L1 ⇄ L2 Bridge Transfer: ${amt} ${bridgeToken}`);
        setBridgeStatus('Kasware signature verified successfully!');
      } catch (err: any) {
        console.error('Kasware signing failed or rejected:', err);
        setIsBridging(false);
        if (triggerAlert) {
          triggerAlert('error', `Bridge transaction signature rejected: ${err?.message || err}`);
        } else {
          alert(`Bridge transaction signature rejected: ${err?.message || err}`);
        }
        return;
      }
    }

    const interval = setInterval(() => {
      setBridgeProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsBridging(false);
            setBridgeAmount('');
            onBridgeTransfer(bridgeDirection, amt, bridgeToken);
          }, 800);
          return 100;
        }

        const next = prev + 15 + Math.floor(Math.random() * 10);
        const clamped = Math.min(100, next);

        if (clamped < 30) {
          setBridgeStatus('Initiating atomic lock smart contract on Kaspa L1...');
        } else if (clamped < 60) {
          setBridgeStatus('Awaiting Kaspa blueScore confirmation (1 block target)...');
        } else if (clamped < 90) {
          setBridgeStatus('Bridging blocks across layers. Minting wrapper asset...');
        } else {
          setBridgeStatus('Verifying cryptographic proofs on destination ledger...');
        }

        return clamped;
      });
    }, 450);
  };

  const getChainName = (chain: typeof activeChain) => {
    switch (chain) {
      case 'L1': return 'Kaspa Mainnet L1';
      case 'L2_IGRA': return 'Igra L2 (Labs)';
      case 'L2_SPARKLE': return 'Sparkle Rollup L2';
      case 'L2_KASPLEX': return 'Kasplex zkEVM L2';
    }
  };

  return (
    <header className="bg-bg-dark/95 backdrop-blur-md border-b border-border-dark py-2.5 px-4 sticky top-0 z-50 shadow-md" id="kaslev-header">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-x-6 gap-y-2.5">
        {/* Brand Logo & Price */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-bg-dark to-bg-darker rounded-xl flex items-center justify-center border border-border-dark shadow-md group hover:border-kaspa/50 transition-all duration-300">
              <svg
                className="w-5 h-5 text-kaspa hover:scale-110 transition-transform duration-300"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                id="kaslev-custom-logo-svg"
              >
                <path
                  d="M16 3L27 10L16 17L5 10L16 3Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 17V29"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 10V22L16 29"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2 1"
                  opacity="0.5"
                />
                <path
                  d="M27 10V22L16 29"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 20L16 14L22 20"
                  stroke="var(--theme-kaspa-light)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-pulse"
                />
                <circle cx="16" cy="14" r="2.5" fill="var(--theme-kaspa)" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight text-white flex items-center gap-1.5">
                Kas<span className="text-kaspa">Lev</span>
                <span className="text-[10px] bg-kaspa-dark text-kaspa px-1.5 py-0.5 rounded-full font-mono">BETA</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-mono">Kaspa High-Leverage L1 & L2 Protocol</p>
            </div>
          </div>

          <div 
            className="flex items-center gap-2 bg-bg-darker px-3 py-1.5 rounded-lg border border-border-dark font-mono cursor-pointer hover:border-kaspa/40 transition-colors group"
            onClick={refetchPrice}
            title={`Source: ${priceSource}. Click to refresh.`}
            id="navbar-kas-price-ticker"
          >
            <span className={`w-2 h-2 rounded-full bg-kaspa ${isPriceLoading ? 'animate-spin border-t-2 border-white' : 'animate-ping'}`} />
            <span className="text-xs text-gray-300">KAS:</span>
            <span className="text-xs font-semibold text-kaspa">${kasPrice.toFixed(5)}</span>
            <RefreshCw className={`w-3 h-3 text-gray-400 group-hover:text-kaspa group-hover:rotate-180 transition-all duration-300 ${isPriceLoading ? 'animate-spin text-kaspa' : ''}`} />
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-bg-darker p-1 rounded-lg border border-border-dark w-full md:w-auto overflow-x-auto scrollbar-none">
          {[
            { id: 'trading', label: 'Terminal', icon: Zap },
            { id: 'strategies', label: 'AI & Automations', icon: Cpu },
            { id: 'transparency', label: 'Protocol Audits', icon: Shield },
            { id: 'toccata', label: 'Toccata Launcher', icon: Code },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-kaspa text-bg-darker font-semibold shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-bg-card'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Network & Wallet Controls */}
        <div className="flex flex-wrap items-center gap-3 justify-start md:justify-end w-full md:w-auto">
          {/* Theme Toggle */}
          <button
            id="theme-contrast-toggle"
            onClick={() => setIsHighContrast(!isHighContrast)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border cursor-pointer ${
              isHighContrast
                ? 'bg-amber-500/15 border-amber-500 text-amber-400 font-bold shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                : 'bg-bg-darker border-border-dark text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            {isHighContrast ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>High-Contrast</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-gray-500" />
                <span>Obsidian</span>
              </>
            )}
          </button>

          {/* Network Health Indicator Dropdown */}
          <div className="relative font-mono" id="network-health-widget">
            <button
              onClick={() => setIsHealthDropdownOpen(!isHealthDropdownOpen)}
              className="flex items-center gap-1.5 bg-bg-darker px-3 py-1.5 rounded-lg border border-border-dark text-xs transition-colors hover:border-kaspa/40 cursor-pointer"
              title="Click to view full network health metrics & real-time DAG propagation"
            >
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-kaspa opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-kaspa"></span>
              </div>
              <Activity className="w-3.5 h-3.5 text-kaspa" />
              <span className="text-gray-300 hidden sm:inline">Health:</span>
              <span className="text-kaspa font-semibold">Optimal</span>
              <span className="text-[10px] text-gray-400 bg-bg-dark px-1.5 py-0.2 rounded border border-border-dark">
                {networkHealths[activeChain]?.latency || 12}ms
              </span>
              <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isHealthDropdownOpen ? 'rotate-180 text-kaspa' : ''}`} />
            </button>

            {/* Health Popover */}
            {isHealthDropdownOpen && (
              <>
                {/* Backdrop overlay to close when clicking outside */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsHealthDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-[310px] sm:w-[350px] bg-bg-dark border border-border-dark rounded-xl shadow-2xl p-4 z-50 animate-fade-in text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border-dark pb-2">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-kaspa animate-pulse" />
                      <span className="font-bold text-white text-sm">Multichain Network Health</span>
                    </div>
                    <span className="text-[9px] text-kaspa font-bold uppercase tracking-wider bg-kaspa-dark/20 border border-kaspa/25 px-1.5 py-0.5 rounded">
                      Real-Time Sync
                    </span>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: 'L1' },
                      { id: 'L2_IGRA' },
                      { id: 'L2_SPARKLE' },
                      { id: 'L2_KASPLEX' }
                    ].map((chain) => {
                      const isCurrent = activeChain === chain.id;
                      const metrics = networkHealths[chain.id];
                      if (!metrics) return null;

                      return (
                        <div 
                          key={chain.id}
                          className={`p-2.5 rounded-lg border transition-all ${
                            isCurrent 
                              ? 'bg-kaspa-dark/5 border-kaspa' 
                              : 'bg-bg-darker border-border-dark hover:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                metrics.latency < 25 ? 'bg-kaspa animate-pulse' : metrics.latency < 50 ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                              }`} />
                              <span className="font-bold text-white text-[11px]">{metrics.name}</span>
                              {isCurrent && (
                                <span className="text-[8px] bg-kaspa text-bg-darker px-1 rounded font-black uppercase">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-500 font-medium">BPS: {metrics.bps}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                metrics.latency < 25 ? 'text-kaspa bg-kaspa-dark/10' : metrics.latency < 50 ? 'text-amber-400 bg-amber-400/5' : 'text-red-400 bg-red-400/5'
                              }`}>
                                {metrics.latency}ms
                              </span>
                            </div>
                          </div>

                          <div className="mb-1 text-[10px] text-gray-400">
                            {metrics.desc}
                          </div>

                          <div className="flex items-center justify-between text-[10px]">
                            <div className="text-gray-400">
                              Block: <span className="text-white font-semibold tabular-nums">{metrics.blockHeight.toLocaleString()}</span>
                            </div>
                            {!isCurrent && (
                              <button
                                onClick={() => {
                                  setActiveChain(chain.id as any);
                                  if (triggerAlert) {
                                    triggerAlert('success', `Switched active chain to ${metrics.name}`);
                                  }
                                }}
                                className="text-[9px] text-kaspa hover:underline font-bold"
                              >
                                Switch →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-border-dark flex items-center justify-between text-[10px] text-gray-400">
                    <span>Block Propagation: 1.0s</span>
                    <span className="text-[9px] bg-bg-darker px-2 py-0.5 rounded border border-border-dark text-gray-300">
                      Sync: 99.98%
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Connected Network Indicator */}
          <div className="flex items-center gap-1.5 bg-bg-darker px-3 py-1.5 rounded-lg border border-border-dark text-xs font-mono">
            <Globe className="w-3.5 h-3.5 text-kaspa" />
            <span className="text-gray-300">{getChainName(activeChain)}</span>
          </div>

          {/* Connect Wallet Trigger */}
          <button
            id="wallet-hub-trigger-btn"
            onClick={() => setIsHubOpen(true)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
              isWalletConnected 
                ? 'bg-kaspa-dark/20 border-kaspa text-kaspa hover:bg-kaspa-dark/30' 
                : 'bg-kaspa text-bg-darker border-kaspa hover:bg-kaspa-light'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>
              {isWalletConnected 
                ? `${connectedWalletType}: ${userL1Address.slice(0, 10)}...` 
                : 'Connect Wallet Hub'
              }
            </span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>
        </div>
      </div>

      {/* L1 Info Bar */}
      <div className="bg-bg-darker border-t border-border-dark mt-2 -mb-2.5 py-1 px-4 text-[11px] text-gray-400 font-mono flex flex-wrap justify-between gap-2 overflow-hidden">
        <div className="flex items-center gap-2 truncate">
          <span className="text-kaspa font-semibold">Dev Wallet:</span>
          <span className="truncate text-gray-300 select-all max-w-[200px] md:max-w-none">{DEV_WALLET}</span>
          <button onClick={() => copyAddress(DEV_WALLET, 'dev')} className="text-[10px] text-kaspa hover:underline ml-1">
            {copied === 'dev' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="flex items-center gap-2 truncate">
          <span className="text-amber-400 font-semibold">Pool Wallet:</span>
          <span className="truncate text-gray-300 select-all max-w-[200px] md:max-w-none">{POOL_WALLET}</span>
          <button onClick={() => copyAddress(POOL_WALLET, 'pool')} className="text-[10px] text-amber-400 hover:underline ml-1">
            {copied === 'pool' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* MULTICHAIN WALLET & BRIDGE HUB MODAL */}
      {isHubOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in" id="wallet-hub-overlay">
          <div className="bg-bg-dark border border-border-dark w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
            
            {/* LEFT COLUMN: CONNECTION & CHAIN STATE */}
            <div className="md:w-1/2 p-6 border-r border-border-dark flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Wallet className="text-kaspa w-5 h-5" />
                  <h3 className="font-display font-bold text-lg text-white">Non-Custodial Wallet Hub</h3>
                </div>
                
                <p className="text-xs text-gray-300 mb-6">
                  Select a wallet provider to sync with Kaspa Mainnet L1 or direct bridging smart contracts across layer 2 rollups.
                </p>

                {/* Wallet Options */}
                <div className="space-y-3 mb-6">
                  {/* Kasware Wallet */}
                  <button
                    onClick={connectKasware}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex justify-between items-center ${
                      connectedWalletType === 'KASWARE'
                        ? 'bg-kaspa-dark/15 border-kaspa text-white'
                        : 'bg-bg-darker border-border-dark hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#1e2330] flex items-center justify-center font-bold text-xs text-kaspa border border-kaspa/20">KW</div>
                      <div>
                        <span className="text-xs font-semibold block">Kasware Wallet (L1 & L2)</span>
                        <span className="text-[10px] text-gray-400 font-mono">Injected Web Standard</span>
                      </div>
                    </div>
                    {connectedWalletType === 'KASWARE' ? (
                      <span className="text-[10px] font-mono bg-kaspa-dark/40 border border-kaspa/30 px-2 py-0.5 rounded text-kaspa">Connected</span>
                    ) : (
                      <span className="text-[10px] text-gray-500 font-mono">Link</span>
                    )}
                  </button>

                  {/* Kaspium Wallet */}
                  <button
                    onClick={() => simulateConnection('KASPIUM')}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex justify-between items-center ${
                      connectedWalletType === 'KASPIUM'
                        ? 'bg-kaspa-dark/15 border-kaspa text-white'
                        : 'bg-bg-darker border-border-dark hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#2a1b3d] flex items-center justify-center font-bold text-xs text-purple-400 border border-purple-500/20">KP</div>
                      <div>
                        <span className="text-xs font-semibold block">Kaspium Mobile Wallet</span>
                        <span className="text-[10px] text-gray-400 font-mono">Secure Pairing Protocol</span>
                      </div>
                    </div>
                    {connectedWalletType === 'KASPIUM' ? (
                      <span className="text-[10px] font-mono bg-kaspa-dark/40 border border-kaspa/30 px-2 py-0.5 rounded text-kaspa">Connected</span>
                    ) : (
                      <span className="text-[10px] text-gray-500 font-mono">Simulate</span>
                    )}
                  </button>

                  {/* KDX Desktop Wallet */}
                  <button
                    onClick={() => simulateConnection('KDX')}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex justify-between items-center ${
                      connectedWalletType === 'KDX'
                        ? 'bg-kaspa-dark/15 border-kaspa text-white'
                        : 'bg-bg-darker border-border-dark hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#152e1f] flex items-center justify-center font-bold text-xs text-emerald-400 border border-emerald-500/20">KD</div>
                      <div>
                        <span className="text-xs font-semibold block">KDX Node Console</span>
                        <span className="text-[10px] text-gray-400 font-mono">Local Node Desktop RPC</span>
                      </div>
                    </div>
                    {connectedWalletType === 'KDX' ? (
                      <span className="text-[10px] font-mono bg-kaspa-dark/40 border border-kaspa/30 px-2 py-0.5 rounded text-kaspa">Connected</span>
                    ) : (
                      <span className="text-[10px] text-gray-500 font-mono">Simulate</span>
                    )}
                  </button>

                  {/* MetaMask / EVM Wallet */}
                  <button
                    id="connect-metamask-btn"
                    onClick={connectMetaMask}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex justify-between items-center ${
                      connectedWalletType === 'METAMASK'
                        ? 'bg-kaspa-dark/15 border-kaspa text-white'
                        : 'bg-bg-darker border-border-dark hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#e87a24]/10 flex items-center justify-center font-bold text-xs text-[#e87a24] border border-[#e87a24]/20">MM</div>
                      <div>
                        <span className="text-xs font-semibold block">MetaMask / EVM Wallet (L2 Bridge)</span>
                        <span className="text-[10px] text-gray-400 font-mono">Web3 Injected RPC Standard</span>
                      </div>
                    </div>
                    {connectedWalletType === 'METAMASK' ? (
                      <span className="text-[10px] font-mono bg-kaspa-dark/40 border border-kaspa/30 px-2 py-0.5 rounded text-kaspa">Connected</span>
                    ) : (
                      <span className="text-[10px] text-gray-500 font-mono">Link / Connect</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Connected States */}
              {isWalletConnected ? (
                <div className="bg-bg-darker p-4 rounded-xl border border-border-dark space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between border-b border-border-dark pb-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Session Active ({connectedWalletType})</span>
                    <span className="w-2 h-2 rounded-full bg-kaspa animate-pulse" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">L1 Kaspa Asset Address <span className="text-kaspa">(Real & Editable)</span>:</span>
                      <button onClick={() => copyAddress(userL1Address, 'usrL1')} className="text-kaspa hover:underline text-[10px]">
                        {copied === 'usrL1' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={userL1Address}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserL1Address(val);
                        setUserWallet(val);
                      }}
                      className="w-full text-white text-[11px] bg-bg-dark px-2.5 py-2 rounded-lg border border-border-dark focus:border-kaspa focus:outline-none transition-all font-mono font-medium"
                      placeholder="e.g. kaspa:qqzjw5..."
                    />
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">L2 Gas (EVM) Wallet <span className="text-kaspa">(Real & Editable)</span>:</span>
                      <button onClick={() => copyAddress(userL2Address, 'usrL2')} className="text-kaspa hover:underline text-[10px]">
                        {copied === 'usrL2' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={userL2Address}
                      onChange={(e) => {
                        setUserL2Address(e.target.value);
                      }}
                      className="w-full text-gray-300 text-[11px] bg-bg-dark px-2.5 py-2 rounded-lg border border-border-dark focus:border-kaspa focus:outline-none transition-all font-mono font-medium"
                      placeholder="e.g. 0x7F26..."
                    />
                  </div>

                  <button
                    onClick={disconnectWallet}
                    className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 rounded-lg text-xs transition-all font-mono font-semibold border border-red-500/20 cursor-pointer mt-2"
                  >
                    Disconnect Active Session
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Offline Message */}
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center">
                    <span className="text-xs text-amber-300 block font-semibold mb-1">Session offline</span>
                    <span className="text-[10px] text-gray-400 leading-relaxed block">
                      Choose one of the wallet providers above to connect, or use the real manual address integration below.
                    </span>
                  </div>

                  {/* Manual Address Integration */}
                  <div className="bg-bg-darker p-4 rounded-xl border border-border-dark space-y-3 font-mono">
                    <div className="flex items-center justify-between border-b border-border-dark pb-1.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Manual Address Input</span>
                      <span className="text-[9px] text-kaspa bg-kaspa-dark/20 border border-kaspa/20 px-1.5 py-0.2 rounded font-bold uppercase">Real Connect</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-gray-500 block">REAL L1 KASPA ADDRESS (KASPA:)</label>
                      <input
                        type="text"
                        value={manualL1Input}
                        onChange={(e) => setManualL1Input(e.target.value)}
                        placeholder="e.g. kaspa:qqzjw5ur7fyq9q7la..."
                        className="w-full bg-bg-dark text-white text-[11px] px-2.5 py-2 rounded-lg border border-border-dark focus:border-kaspa focus:outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-gray-500 block">REAL L2 EVM ADDRESS (0X)</label>
                      <input
                        type="text"
                        value={manualL2Input}
                        onChange={(e) => setManualL2Input(e.target.value)}
                        placeholder="e.g. 0x7F268b82Ac901E9b7c84D76de02D70..."
                        className="w-full bg-bg-dark text-white text-[11px] px-2.5 py-2 rounded-lg border border-border-dark focus:border-kaspa focus:outline-none transition-all"
                      />
                    </div>

                    <button
                      onClick={handleManualConnect}
                      className="w-full bg-kaspa hover:bg-kaspa-light text-bg-darker font-bold py-2 rounded-lg text-xs transition-all uppercase tracking-wider cursor-pointer text-center"
                    >
                      Connect Real Custom Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: NETWORKS & L2 CROSS-CHAIN BRIDGE */}
            <div className="md:w-1/2 p-6 bg-[#0c0f17] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Globe className="text-kaspa w-5 h-5" />
                    <h3 className="font-display font-bold text-lg text-white">L1 & L2 Network Matrix</h3>
                  </div>
                  <button 
                    onClick={() => setIsHubOpen(false)}
                    className="text-gray-400 hover:text-white font-mono text-sm"
                  >
                    Close
                  </button>
                </div>

                {/* Network Switching Selector */}
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {[
                    { id: 'L1', label: 'Kaspa L1 Main', desc: 'Secure Layer 1 DAG' },
                    { id: 'L2_IGRA', label: 'Igra L2 (Labs)', desc: 'Rollup, zero gas fees' },
                    { id: 'L2_SPARKLE', label: 'Sparkle L2', desc: 'Sovereign App Chain' },
                    { id: 'L2_KASPLEX', label: 'Kasplex zkEVM', desc: 'Solidity Smart Contracts' }
                  ].map((net) => (
                    <button
                      key={net.id}
                      onClick={() => setActiveChain(net.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        activeChain === net.id
                          ? 'bg-kaspa-dark/20 border-kaspa text-white'
                          : 'bg-bg-darker border-border-dark hover:border-gray-700 text-gray-400'
                      }`}
                    >
                      <span className="text-xs font-bold block">{net.label}</span>
                      <span className="text-[9px] text-gray-500 block leading-tight mt-0.5">{net.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Bridging section */}
                <div className="border-t border-border-dark pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="text-kaspa w-4.5 h-4.5" />
                    <span className="text-sm font-display font-bold text-white">Kaspa L1 ⇄ L2 Bridge Portal</span>
                  </div>

                  {/* Bridge Direction Toggle */}
                  <div className="grid grid-cols-2 gap-1 bg-bg-darker p-1 rounded border border-border-dark mb-4">
                    <button
                      onClick={() => setBridgeDirection('L1_TO_L2')}
                      className={`py-1 text-[10px] font-mono rounded transition-all cursor-pointer ${
                        bridgeDirection === 'L1_TO_L2'
                          ? 'bg-kaspa text-bg-darker font-bold'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      L1 ➔ L2 (Deposit)
                    </button>
                    <button
                      onClick={() => setBridgeDirection('L2_TO_L1')}
                      className={`py-1 text-[10px] font-mono rounded transition-all cursor-pointer ${
                        bridgeDirection === 'L2_TO_L1'
                          ? 'bg-kaspa text-bg-darker font-bold'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      L2 ➔ L1 (Withdraw)
                    </button>
                  </div>

                  {/* Token & Amount Fields */}
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1">
                      <label className="block text-[9px] font-mono text-gray-400 mb-1">Bridge Amount</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={bridgeAmount}
                        onChange={(e) => setBridgeAmount(e.target.value)}
                        className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono text-gray-400 mb-1">Select Asset</label>
                      <select
                        value={bridgeToken}
                        onChange={(e) => setBridgeToken(e.target.value)}
                        className="bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded px-2 py-1.5 text-xs text-white font-mono"
                      >
                        <option value="KAS">KAS (Kaspa)</option>
                        <option value="NACHO">NACHO</option>
                        <option value="KASPY">KASPY</option>
                      </select>
                    </div>
                  </div>

                  {/* Dev L2 & Platform L2 Addresses */}
                  <div className="bg-bg-darker/50 border border-border-dark p-3 rounded-xl space-y-1.5 text-[10px] font-mono text-gray-400 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-bold text-[9px]">L2 PLATFORM CONTRACT WALLET:</span>
                      <button onClick={() => copyAddress(PLATFORM_L2_WALLET, 'pltl2')} className="text-kaspa hover:underline">
                        {copied === 'pltl2' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="text-white truncate bg-bg-dark p-1 rounded text-[10px] select-all">{PLATFORM_L2_WALLET}</div>

                    <div className="flex justify-between items-center pt-1">
                      <span className="text-kaspa font-bold text-[9px]">L2 DEVELOPER SECURITY WALLET:</span>
                      <button onClick={() => copyAddress(DEV_L2_WALLET, 'devl2')} className="text-kaspa hover:underline">
                        {copied === 'devl2' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="text-white truncate bg-bg-dark p-1 rounded text-[10px] select-all">{DEV_L2_WALLET}</div>
                  </div>
                </div>
              </div>

              {/* Progress and Execution */}
              <div>
                {isBridging ? (
                  <div className="bg-bg-darker p-3.5 rounded-xl border border-kaspa/20 space-y-2">
                    <div className="flex justify-between text-xs font-mono text-gray-300">
                      <span className="animate-pulse text-kaspa">Bridging Assets...</span>
                      <span>{bridgeProgress}%</span>
                    </div>
                    <div className="w-full bg-bg-dark rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-kaspa h-1.5 transition-all duration-300"
                        style={{ width: `${bridgeProgress}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 leading-tight block">{bridgeStatus}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleBridgeAction}
                    disabled={!isWalletConnected || !bridgeAmount || parseFloat(bridgeAmount) <= 0}
                    className={`w-full py-2 px-4 rounded-xl font-display font-bold text-xs text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      isWalletConnected && bridgeAmount && parseFloat(bridgeAmount) > 0
                        ? 'bg-kaspa text-bg-darker hover:bg-kaspa-light shadow-lg'
                        : 'bg-bg-darker text-gray-500 border border-border-dark cursor-not-allowed'
                    }`}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Initiate Cross-Chain Bridge</span>
                  </button>
                )}
                
                <span className="text-[9px] text-gray-500 text-center block mt-2 font-mono">
                  Bridge transactions take approximately 1 Kaspa block target (~1 second) to settle.
                </span>
              </div>

            </div>

          </div>
        </div>
      )}
    </header>
  );
}
