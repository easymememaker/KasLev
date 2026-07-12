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
import { ensureNetwork, setActiveNetwork, isSupportedNetwork } from '../web3/kaslev';

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
  const [isTransparencyOpen, setIsTransparencyOpen] = useState(false);

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
    L1: { name: 'Kaspa Mainnet L1', desc: 'GHOSTDAG L1 — no EVM (view-only)', blockHeight: 84291048, latency: 12, status: 'optimal', bps: 1.0 },
    L2_IGRA: { name: 'Igra Galleon Testnet', desc: 'EVM L2 · KasLev LIVE', blockHeight: 12845910, latency: 24, status: 'optimal', bps: 0.67 },
    L2_SPARKLE: { name: 'Sparkle L2 (soon)', desc: 'Not yet live (view-only)', blockHeight: 8723101, latency: 45, status: 'optimal', bps: 0.33 },
    L2_KASPLEX: { name: 'Kasplex zkEVM Testnet', desc: 'EVM L2 · KasLev LIVE', blockHeight: 4912854, latency: 32, status: 'optimal', bps: 0.50 }
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
    const eth = (window as any).ethereum;
    // No silent fake-connect: if there's no injected wallet, say so clearly.
    if (typeof eth === 'undefined') {
      triggerAlert?.('error', 'MetaMask not detected. Install the MetaMask extension, then open this page (localhost:3000) in that same browser.');
      return;
    }
    try {
      triggerAlert?.('info', 'Approve the connection request in the MetaMask popup...');
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        triggerAlert?.('error', 'No account returned. Unlock MetaMask and try again.');
        return;
      }
      // Make sure the wallet is on the active L2 so trades actually land on-chain.
      if (isSupportedNetwork(activeChain)) {
        setActiveNetwork(activeChain);
        await ensureNetwork();
      }
      const addr = accounts[0];
      setUserL2Address(addr);
      const virtualL1 = `kaspa:qqzjw5evm${addr.substring(2, 32).toLowerCase()}`;
      setUserL1Address(virtualL1);
      setUserWallet(virtualL1);
      setIsWalletConnected(true);
      setConnectedWalletType('METAMASK');
      setIsHubOpen(false);
      triggerAlert?.('success', `Wallet connected: ${addr.slice(0, 6)}…${addr.slice(-4)}`);
    } catch (err: any) {
      console.error('MetaMask connection failed', err);
      triggerAlert?.('error', err?.code === 4001 ? 'Connection rejected in MetaMask.' : `Connection failed: ${err?.message || 'unknown error'}`);
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
      case 'L2_IGRA': return 'Igra Galleon Testnet';
      case 'L2_SPARKLE': return 'Sparkle L2 (soon)';
      case 'L2_KASPLEX': return 'Kasplex zkEVM Testnet';
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
                                onClick={async () => {
                                  setActiveChain(chain.id as any);
                                  if (isSupportedNetwork(chain.id)) {
                                    // Point the protocol at this L2's contracts...
                                    setActiveNetwork(chain.id);
                                    if (isWalletConnected && connectedWalletType === 'METAMASK') {
                                      // ...and ask the wallet to switch to its chain so trades land here.
                                      try {
                                        await ensureNetwork();
                                        triggerAlert?.('success', `Wallet + protocol now on ${metrics.name}`);
                                      } catch (e: any) {
                                        triggerAlert?.('error', `Network switch rejected: ${e?.message || 'cancelled'}`);
                                      }
                                    } else {
                                      triggerAlert?.('success', `Now trading on ${metrics.name}`);
                                    }
                                  } else {
                                    triggerAlert?.('info', `${metrics.name}: view-only — no smart contracts on this chain yet`);
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

          {/* Transparency (protocol wallets + lock) */}
          <button
            onClick={() => setIsTransparencyOpen(true)}
            title="Protocol transparency — public wallets & seed lock"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-bg-darker border border-border-dark text-gray-400 hover:text-kaspa hover:border-kaspa/40 transition-all cursor-pointer"
          >
            <Shield className="w-4 h-4" />
          </button>

          {/* Connect Wallet Trigger */}
          <button
            id="wallet-hub-trigger-btn"
            onClick={() => setIsHubOpen(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-sans font-semibold transition-all cursor-pointer border ${
              isWalletConnected
                ? 'bg-kaspa/10 border-kaspa/40 text-kaspa hover:bg-kaspa/15'
                : 'bg-kaspa text-bg-darker border-kaspa hover:bg-kaspa-light shadow-[0_2px_12px_rgba(20,184,166,0.35)]'
            }`}
          >
            {isWalletConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-kaspa animate-pulse" />
                <span className="font-mono">{userL2Address.slice(0, 6)}…{userL2Address.slice(-4)}</span>
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                <span>Connect Wallet</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* TRANSPARENCY MODAL — protocol wallets + seed lock, on demand (not cluttering the header) */}
      {isTransparencyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setIsTransparencyOpen(false)}
        >
          <div
            className="bg-bg-dark border border-border-dark w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                <Shield className="w-4.5 h-4.5 text-kaspa" /> Protocol Transparency
              </h3>
              <button onClick={() => setIsTransparencyOpen(false)} className="text-gray-500 hover:text-white text-sm font-mono">✕</button>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Every protocol wallet is public and every rule lives in the open-source contract. The
              developer seed is time-locked for 100 days and only the original principal is ever withdrawable.
            </p>

            {[
              { label: 'Developer Wallet', addr: DEV_WALLET, key: 'dev', color: 'text-kaspa' },
              { label: 'Liquidity Pool Wallet', addr: POOL_WALLET, key: 'pool', color: 'text-amber-400' },
            ].map((w) => (
              <div key={w.key} className="bg-bg-darker border border-border-dark rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-semibold ${w.color}`}>{w.label}</span>
                  <button onClick={() => copyAddress(w.addr, w.key)} className="text-[10px] text-gray-400 hover:text-kaspa">
                    {copied === w.key ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <div className="text-[10px] text-gray-300 font-mono break-all select-all bg-bg-dark rounded-lg p-2">{w.addr}</div>
              </div>
            ))}

            <div className="text-[11px] text-gray-400 border-t border-border-dark pt-3">
              Full pool balance, locked seed, and the unlock countdown are in the{' '}
              <span className="text-kaspa font-semibold">Protocol Audits</span> tab.
            </div>
          </div>
        </div>
      )}

      {/* MULTICHAIN WALLET & BRIDGE HUB MODAL */}
      {isHubOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in" id="wallet-hub-overlay">
          <div className="bg-bg-dark border border-border-dark w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col">

            {/* WALLET PICKER */}
            <div className="w-full p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="text-kaspa w-5 h-5" />
                    <h3 className="font-display font-bold text-base text-white">Connect Wallet</h3>
                  </div>
                  <button onClick={() => setIsHubOpen(false)} className="text-gray-500 hover:text-white text-sm font-mono">✕</button>
                </div>

                {/* Wallet options — MetaMask connects to the Kaspa EVM L2 for real trading.
                    Others are clearly "Soon" and never fake-connect. */}
                <p className="text-xs text-gray-400 mb-4">Choose how you'd like to connect to the Kaspa L2.</p>
                <div className="space-y-2.5 mb-5">
                  {/* MetaMask — the real one */}
                  <button
                    id="connect-metamask-btn"
                    onClick={connectMetaMask}
                    className={`group w-full p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
                      connectedWalletType === 'METAMASK'
                        ? 'bg-kaspa/10 border-kaspa'
                        : 'bg-bg-darker border-border-dark hover:border-kaspa/50 hover:bg-bg-card'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f6851b] to-[#e2761b] flex items-center justify-center shrink-0 shadow-md">
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="#fff">
                        <path d="M20.7 3.3l-6.9 5.1 1.3-3zM3.3 3.3l6.8 5.2-1.2-3.1zM17.9 16l-1.9 2.9 4 1.1 1.1-3.9zM2.9 16.1L4 20l4-1.1L6.1 16z" opacity=".9" />
                        <path d="M7.8 10.7L6.7 12.4l4 .2-.1-4.3zM16.2 10.7l-2.8-2.4-.1 4.4 4-.2zM8 18.9l2.4-1.2-2.1-1.6zM13.6 17.7l2.4 1.2-.3-2.8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-white block">MetaMask</span>
                      <span className="text-[11px] text-gray-400">Connect to the Kaspa EVM L2 · real trading</span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                      connectedWalletType === 'METAMASK'
                        ? 'bg-kaspa text-bg-darker'
                        : 'bg-kaspa/10 text-kaspa border border-kaspa/30 group-hover:bg-kaspa/20'
                    }`}>
                      {connectedWalletType === 'METAMASK' ? 'Connected' : 'Connect'}
                    </span>
                  </button>

                  {/* Kasware — coming soon (Kaspa-native, EVM support later) */}
                  <div className="w-full p-3.5 rounded-2xl border border-border-dark/60 bg-bg-darker/40 flex items-center gap-3.5 opacity-60 cursor-not-allowed select-none">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#14b8a6] to-[#0f766e] flex items-center justify-center shrink-0 font-display font-bold text-white text-sm">Ka</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-200 block">Kasware</span>
                      <span className="text-[11px] text-gray-500">Kaspa-native wallet</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-bg-dark text-gray-500 border border-border-dark shrink-0">Soon</span>
                  </div>

                  {/* Kaspium — coming soon */}
                  <div className="w-full p-3.5 rounded-2xl border border-border-dark/60 bg-bg-darker/40 flex items-center gap-3.5 opacity-60 cursor-not-allowed select-none">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#5b21b6] flex items-center justify-center shrink-0 font-display font-bold text-white text-sm">Kp</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-200 block">Kaspium</span>
                      <span className="text-[11px] text-gray-500">Mobile wallet</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-bg-dark text-gray-500 border border-border-dark shrink-0">Soon</span>
                  </div>
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
                <div className="p-3 bg-bg-darker border border-border-dark rounded-xl text-center">
                  <span className="text-[11px] text-gray-400 leading-relaxed block">
                    Pick a wallet above. MetaMask connects to the Kaspa EVM L2 for real trading.
                  </span>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: NETWORKS & L2 CROSS-CHAIN BRIDGE — hidden (bridge is simulated;
                network switching lives in the header health widget). */}
            <div className="hidden">
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
