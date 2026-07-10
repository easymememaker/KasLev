/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Code, Key, Plus, Shield, CheckCircle2, AlertTriangle, Layers, Trash2 } from 'lucide-react';
import { Token } from '../types';

interface TokenManagerProps {
  tokens: Token[];
  onAddToken: (token: Token) => void;
  onRemoveToken: (id: string) => void;
  userWallet: string;
  triggerAlert?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export default function TokenManager({
  tokens,
  onAddToken,
  onRemoveToken,
  userWallet,
  triggerAlert,
}: TokenManagerProps) {
  // Developer authorization state
  const DEV_WALLET = 'kaspa:qzlcgpevs5ma2mhhxgc5fep3mw3z0k3huh92xh3gruuglxq70s85uy05cc9z9';
  const isAuthorized = userWallet.trim().toLowerCase() === DEV_WALLET.toLowerCase();

  // Form states
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [initialPrice, setInitialPrice] = useState('0.005');
  const [decimals, setDecimals] = useState('8');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) {
      setStatusMessage({
        type: 'error',
        text: 'Action Denied. Only the authorized developer wallet address can register custom Toccata assets.',
      });
      return;
    }

    if (!symbol || !name || !initialPrice) {
      setStatusMessage({
        type: 'error',
        text: 'All fields are required to list a new Kaspa ecosystem token.',
      });
      return;
    }

    const priceNum = parseFloat(initialPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid positive initial price.',
      });
      return;
    }

    const newToken: Token = {
      id: symbol.toLowerCase().trim(),
      symbol: symbol.toUpperCase().trim(),
      name: name.trim(),
      price: priceNum,
      change24h: 0,
      isCustom: true,
      contractAddress: `kaspa:toccata:token:${Math.random().toString(36).substring(2, 10)}`,
      decimals: parseInt(decimals) || 8,
    };

    onAddToken(newToken);
    setSymbol('');
    setName('');
    setInitialPrice('0.005');
    setStatusMessage({
      type: 'success',
      text: `Asset ${newToken.symbol} (${newToken.name}) successfully registered in the protocol after Toccata update!`,
    });

    setTimeout(() => setStatusMessage(null), 5000);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6" id="token-manager-panel">
      {/* Dev Header Badge */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${
        isAuthorized 
          ? 'bg-kaspa-dark/20 border-kaspa text-kaspa' 
          : 'bg-bg-dark border-border-dark text-gray-400'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAuthorized ? 'bg-kaspa text-bg-darker' : 'bg-bg-darker text-gray-500'}`}>
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-white">Toccata Hard Fork Asset Manager</h3>
            <p className="text-xs text-gray-300">
              {isAuthorized 
                ? 'Authorized: Connected user address matches Developer Wallet' 
                : 'Locked: Connect the official developer wallet to register assets'}
            </p>
          </div>
        </div>
        <div className="text-xs font-mono bg-bg-darker px-3 py-1.5 rounded border border-border-dark">
          <span className="text-gray-400">Target wallet: </span>
          <span className="text-white select-all">kaspa:qzlcgpevs...uglxq70s85uy05cc9z9</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Token Launcher Form */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="text-kaspa w-5 h-5" />
            <h4 className="font-display font-bold text-sm text-white">Deploy Custom Kaspa Ecosystem Token</h4>
          </div>

          {!isAuthorized && (
            <div className="bg-amber-500/10 text-amber-300 p-3 rounded-lg border border-amber-500/20 text-xs flex gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <strong>Simulation Notice:</strong> To simulate adding a token, copy the dev wallet address from the header bar, paste it into the "User Wallet" box, then come back here to deploy!
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Token Symbol</label>
              <input
                id="deploy-token-symbol"
                type="text"
                placeholder="e.g. KASPY, KSP"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={!isAuthorized}
                className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded px-3 py-2 text-xs font-mono text-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1">Token Name</label>
              <input
                id="deploy-token-name"
                type="text"
                placeholder="e.g. Kaspa Meme Coin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAuthorized}
                className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded px-3 py-2 text-xs text-white disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">Initial Price (USD)</label>
                <input
                  id="deploy-token-price"
                  type="number"
                  step="0.000001"
                  placeholder="0.015"
                  value={initialPrice}
                  onChange={(e) => setInitialPrice(e.target.value)}
                  disabled={!isAuthorized}
                  className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded px-3 py-2 text-xs font-mono text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">Decimals</label>
                <select
                  id="deploy-token-decimals"
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  disabled={!isAuthorized}
                  className="w-full bg-bg-darker border border-border-dark focus:border-kaspa focus:outline-none rounded px-3 py-2 text-xs font-mono text-white disabled:opacity-50"
                >
                  <option value="8">8 Decimals</option>
                  <option value="9">9 Decimals</option>
                  <option value="18">18 Decimals</option>
                </select>
              </div>
            </div>

            {statusMessage && (
              <div className={`p-3 rounded text-xs flex items-start gap-2 ${
                statusMessage.type === 'success' 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <button
              id="deploy-token-submit"
              type="submit"
              disabled={!isAuthorized}
              className="w-full bg-kaspa hover:bg-kaspa-light text-bg-darker font-display font-bold text-xs py-2 px-4 rounded transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Code className="w-4 h-4" />
              Register Toccata Native Asset
            </button>
          </form>
        </div>

        {/* Existing Assets List */}
        <div className="bg-bg-dark rounded-xl border border-border-dark p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="text-kaspa w-5 h-5" />
              <h4 className="font-display font-bold text-sm text-white">Tradeable Assets Pool</h4>
            </div>
            <span className="text-[10px] font-mono text-gray-400 bg-bg-darker px-2 py-0.5 rounded border border-border-dark">
              {tokens.length} Assets
            </span>
          </div>

          <p className="text-xs text-gray-300">
            Below is the comprehensive list of tradeable assets registered on KasLev. Developer-listed post-Toccata assets can be removed.
          </p>

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
            {tokens.map((token) => (
              <div
                key={token.id}
                id={`asset-row-${token.symbol.toLowerCase()}`}
                className="bg-bg-darker p-3 rounded-lg border border-border-dark flex items-center justify-between transition-all hover:border-gray-700"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm text-white">{token.symbol}</span>
                    <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{token.name}</span>
                    {token.isCustom && (
                      <span className="text-[9px] bg-kaspa-dark text-kaspa border border-kaspa/20 px-1.5 py-0.2 rounded font-mono">
                        TOCCATA
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 block truncate max-w-[200px]">
                    {token.contractAddress || 'kaspa:native:kaspacoin'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-white block">${token.price.toFixed(5)}</span>
                    <span className="text-[10px] font-mono text-gray-400">Decimals: {token.decimals}</span>
                  </div>

                  {token.isCustom && (
                    <button
                      id={`delete-asset-${token.symbol.toLowerCase()}`}
                      onClick={() => {
                        if (!isAuthorized) {
                          if (triggerAlert) {
                            triggerAlert('error', 'Only the developer wallet can remove registered Toccata assets.');
                          } else {
                            alert("Only the developer wallet can remove registered Toccata assets.");
                          }
                          return;
                        }
                        onRemoveToken(token.id);
                      }}
                      className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer p-1"
                      title="Deregister Asset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
