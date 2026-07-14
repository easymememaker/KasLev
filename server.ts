/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { NETWORKS, NetworkKey } from './src/web3/config';

dotenv.config();
// The keeper signs oracle pushes with the deployer/keeper key kept in contracts/.env
// (never shipped to the browser bundle — this file runs on the server only).
dotenv.config({ path: path.join(process.cwd(), 'contracts', '.env') });

// ---------------------------------------------------------------------------
// Shared live-price source (used by the /api proxy AND the on-chain keeper)
// ---------------------------------------------------------------------------

interface LivePrice {
  price: number;
  change24h: number;
  source: string;
}

async function getLivePrice(): Promise<LivePrice | null> {
  // Source 1: Gate.io
  try {
    const response = await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=KAS_USDT');
    if (response.ok) {
      const json: any = await response.json();
      if (Array.isArray(json) && json.length > 0) {
        const lastPrice = parseFloat(json[0].last);
        const changePct = parseFloat(json[0].change_percentage || '0');
        if (!isNaN(lastPrice) && lastPrice > 0) {
          return { price: lastPrice, change24h: changePct, source: 'Gate.io (L1 Real Oracle)' };
        }
      }
    }
  } catch (e: any) {
    console.warn('price: Gate.io fetch failed, trying MEXC...', e.message);
  }

  // Source 2: MEXC
  try {
    const response = await fetch('https://api.mexc.com/api/v3/ticker/24hr?symbol=KASUSDT');
    if (response.ok) {
      const json: any = await response.json();
      const lastPrice = parseFloat(json.lastPrice);
      const changePct = parseFloat(json.priceChangePercent || '0');
      if (!isNaN(lastPrice) && lastPrice > 0) {
        return { price: lastPrice, change24h: changePct, source: 'MEXC (L1 Real Oracle)' };
      }
    }
  } catch (e: any) {
    console.warn('price: MEXC fetch failed, trying CoinGecko...', e.message);
  }

  // Source 3: CoinGecko
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true');
    if (response.ok) {
      const json: any = await response.json();
      if (json.kaspa) {
        const lastPrice = parseFloat(json.kaspa.usd);
        const changePct = parseFloat(json.kaspa.usd_24h_change || '0');
        if (!isNaN(lastPrice) && lastPrice > 0) {
          return { price: lastPrice, change24h: changePct, source: 'CoinGecko (L1 Real Oracle)' };
        }
      }
    }
  } catch (e: any) {
    console.warn('price: CoinGecko fetch failed', e.message);
  }

  return null;
}

// ---------------------------------------------------------------------------
// KEEPER SERVICE — keeps the deployed testnets ALIVE while the app runs:
//   1. pushes the live KAS price to each network's median oracle, so getPrice()
//      never goes stale and trading never reverts with ZeroPrice/StalePrice;
//   2. scans open positions and liquidates any past maintenance margin.
// Runs only when a reporter key is configured; disable with KEEPER_DISABLED=true.
// ---------------------------------------------------------------------------

const KEEPER_ORACLE_ABI = [
  'function setPrice(bytes32, uint256)',
  'function isReporter(address) view returns (bool)',
  'function getPrice(bytes32) view returns (uint256, uint256)',
];
const KEEPER_PERPS_ABI = [
  'function nextPositionId() view returns (uint256)',
  'function positions(uint256) view returns (address trader, bytes32 assetId, bool isLong, bool closed, uint256 leverage, uint256 margin, uint256 entryPrice, uint16 feeBps, uint256 openedAt)',
  'function isLiquidatable(uint256) view returns (bool)',
  'function liquidate(uint256)',
];

const KAS_ASSET_ID = ethers.keccak256(ethers.toUtf8Bytes('KAS'));
// 150s = half the oracle's 300s maxAge: one failed push still leaves a retry before
// the price goes stale, while limiting gas burn on chains with enforced minimum gas
// prices (Igra: 2000 gwei per push).
const KEEPER_INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS || 150_000);

interface KeeperNetworkStatus {
  network: string;
  chainId: number;
  enabled: boolean;
  reporter: boolean | null;
  lastPushAt: string | null;
  lastPushPrice: number | null;
  lastPushTx: string | null;
  oraclePrice: number | null;
  oracleFresh: boolean;
  openPositions: number;
  liquidated: number;
  lastError: string | null;
}

const keeperStatus: Record<string, KeeperNetworkStatus> = {};

function startKeeper() {
  if ((process.env.KEEPER_DISABLED || '').toLowerCase() === 'true') {
    console.log('keeper: disabled via KEEPER_DISABLED');
    return;
  }
  const key = process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    console.log('keeper: no KEEPER_PRIVATE_KEY / DEPLOYER_PRIVATE_KEY found — oracle upkeep off');
    return;
  }

  for (const netKey of Object.keys(NETWORKS) as NetworkKey[]) {
    const net = NETWORKS[netKey];
    keeperStatus[netKey] = {
      network: net.name,
      chainId: net.chainIdDec,
      enabled: true,
      reporter: null,
      lastPushAt: null,
      lastPushPrice: null,
      lastPushTx: null,
      oraclePrice: null,
      oracleFresh: false,
      openPositions: 0,
      liquidated: 0,
      lastError: null,
    };
    runKeeperLoop(netKey, key.startsWith('0x') ? key : '0x' + key).catch((e) =>
      console.error(`keeper[${netKey}]: loop crashed:`, e.message),
    );
  }
}

async function runKeeperLoop(netKey: NetworkKey, key: string) {
  const net = NETWORKS[netKey];
  const status = keeperStatus[netKey];
  const provider = new ethers.JsonRpcProvider(net.rpcUrl);

  // Hard guard: never sign against an RPC that isn't the chain we think it is.
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== net.chainIdDec) {
    status.enabled = false;
    status.lastError = `RPC is chain ${chainId}, expected ${net.chainIdDec} — keeper off for this network`;
    console.error(`keeper[${netKey}]: ${status.lastError}`);
    return;
  }

  const signer = new ethers.Wallet(key, provider);
  const oracle = new ethers.Contract(net.contracts.KasLevOracle, KEEPER_ORACLE_ABI, signer);
  const perps = new ethers.Contract(net.contracts.KasLevPerps, KEEPER_PERPS_ABI, signer);
  const txOpts = net.minGasPriceWei ? { gasPrice: BigInt(net.minGasPriceWei) } : {};

  console.log(`keeper[${netKey}]: online — signer ${signer.address.slice(0, 10)}…`);

  let running = false;
  const cycle = async () => {
    if (running) return; // never overlap slow cycles
    running = true;
    try {
      // Reporter check is retried until it succeeds — a transient RPC failure at
      // startup must not silently disable pushes forever.
      if (status.reporter !== true) {
        status.reporter = await oracle.isReporter(signer.address);
        console.log(`keeper[${netKey}]: reporter=${status.reporter}`);
      }

      // 1. Oracle upkeep
      const live = await getLivePrice();
      if (live && status.reporter) {
        const tx = await oracle.setPrice(KAS_ASSET_ID, ethers.parseEther(live.price.toFixed(8)), txOpts);
        await tx.wait();
        status.lastPushAt = new Date().toISOString();
        status.lastPushPrice = live.price;
        status.lastPushTx = tx.hash;
        console.log(`keeper[${netKey}]: KAS = $${live.price} (${live.source}) tx ${tx.hash.slice(0, 12)}…`);
      }

      // Read back what the oracle currently reports (0 == refusing to price).
      const [p] = await oracle.getPrice(KAS_ASSET_ID);
      status.oraclePrice = Number(ethers.formatEther(p));
      status.oracleFresh = status.oraclePrice > 0;

      // 2. Liquidation scan
      const next = Number(await perps.nextPositionId());
      let open = 0;
      for (let id = 1; id < next; id++) {
        const pos = await perps.positions(id);
        if (pos.closed) continue;
        open++;
        if (await perps.isLiquidatable(id)) {
          try {
            const tx = await perps.liquidate(id, txOpts);
            await tx.wait();
            status.liquidated++;
            console.log(`keeper[${netKey}]: liquidated position #${id} tx ${tx.hash.slice(0, 12)}…`);
          } catch (e: any) {
            console.warn(`keeper[${netKey}]: liquidate #${id} failed:`, e.shortMessage || e.message);
          }
        }
      }
      status.openPositions = open;
      status.lastError = null;
    } catch (e: any) {
      status.lastError = e.shortMessage || e.message;
      console.warn(`keeper[${netKey}]: cycle error:`, status.lastError);
    } finally {
      running = false;
    }
  };

  await cycle();
  setInterval(cycle, KEEPER_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Local quant fallback for the AI tab — keeps strategy forecasts functional
// even without a cloud AI key, and is honestly labeled as such.
// ---------------------------------------------------------------------------

function localQuantForecast(symbol: string, price: number, change24h: number) {
  const momentum = change24h / 100;
  const strength = Math.min(1, Math.abs(momentum) * 12);
  const action = Math.abs(momentum) < 0.004 ? 'HOLD' : momentum > 0 ? 'LONG' : 'SHORT';
  const leverage = Math.max(2, Math.min(50, Math.round(10 * (1 - strength) + 5)));
  const confidence = Math.round(40 + strength * 45);
  const direction = momentum > 0 ? 'bullish continuation' : momentum < 0 ? 'bearish pressure' : 'range-bound consolidation';
  return {
    forecast: `${symbol} is showing ${direction} with a ${change24h.toFixed(2)}% 24h move around $${price}. Volatility-adjusted sizing suggests conservative leverage.`,
    action,
    leverage,
    confidence,
    reasoning: `Momentum heuristic on 24h change (${change24h.toFixed(2)}%) — local quant engine (no cloud AI key configured).`,
    engine: 'local-quant',
  };
}

// ---------------------------------------------------------------------------

// Minimal in-memory rate limiter for the public API surface: per-IP sliding window.
// Enough to stop accidental hammering / trivial abuse on a public testnet host
// without pulling in a dependency; a reverse proxy can layer stricter limits.
function rateLimiter(maxPerMinute: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length === 0) hits.delete(ip);
      else hits.set(ip, fresh);
    }
  }, 30_000).unref();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const times = (hits.get(ip) || []).filter((t) => t > now - 60_000);
    if (times.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests — slow down.' });
    }
    times.push(now);
    hits.set(ip, times);
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '32kb' }));
  app.use('/api/', rateLimiter(120));

  // API route for live Kaspa (KAS) price proxy to prevent CORS issues
  app.get('/api/kaspa-price', async (_req, res) => {
    const live = await getLivePrice();
    if (live) return res.json(live);
    // Fallback response with simulated pricing
    return res.json({ price: 0.1542, change24h: 2.45, source: 'Kaspa Proxy Fallback (Simulated)' });
  });

  // Liveness probe for hosting platforms + uptime pingers. Cheap by design (no
  // RPC calls) — also reports whether each network's oracle was fresh last cycle.
  app.get('/healthz', (_req, res) => {
    const nets = Object.values(keeperStatus);
    res.json({
      ok: true,
      uptimeSec: Math.floor(process.uptime()),
      keeper: nets.length === 0 ? 'off' : nets.every((n) => n.oracleFresh) ? 'fresh' : 'degraded',
    });
  });

  // Keeper / testnet liveness for the frontend health widgets.
  app.get('/api/keeper/status', (_req, res) => {
    res.json({
      intervalMs: KEEPER_INTERVAL_MS,
      networks: keeperStatus,
    });
  });

  // API route for Gemini AI Forecast & Trade Recommendations.
  // Tighter limit: this one can call a billed cloud model.
  app.post('/api/ai-forecast', rateLimiter(12), async (req, res) => {
    const { symbol, price, change24h, history, l2Active } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    // No cloud key → honest local fallback instead of a 500 that breaks the tab.
    if (!apiKey) {
      return res.json(localQuantForecast(symbol || 'KAS', Number(price) || 0, Number(change24h) || 0));
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        You are the Kaspa Perps L1 & L2 Autonomous AI Trading Agent.
        Analyze the following real-time market data to output a trading forecast and execution directive:
        - Active Instrument: ${symbol} / USDT
        - Current Oracle Price: $${price}
        - 24h Price Change: ${change24h}%
        - L2 Network Activated: ${l2Active ? 'Yes' : 'No'}
        - Recent Account Activity: ${JSON.stringify(history?.slice(0, 5))}

        Provide a raw JSON response exactly inside the following structure:
        {
          "forecast": "1-2 sentences of microtechnical analysis of order flows, volumes and volatility levels on ${symbol}",
          "action": "LONG" or "SHORT" or "HOLD",
          "leverage": a number between 2 and 1000 representing optimal position leverage based on volatility,
          "confidence": a score between 1 and 100 representing signal strength,
          "reasoning": "A concise, professional trading directive reason"
        }
        Do NOT wrap your response with markdown formatting like \`\`\`json. Return only the raw JSON string.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text?.trim() || '';
      // Sanitize potential markdown syntax
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

      try {
        const json = JSON.parse(cleaned);
        res.json({ ...json, engine: 'gemini' });
      } catch (err) {
        // Fallback parser for text
        console.warn('Failed parsing JSON, sending raw text:', text);
        res.json({
          forecast: text,
          action: text.toUpperCase().includes('LONG') ? 'LONG' : text.toUpperCase().includes('SHORT') ? 'SHORT' : 'HOLD',
          leverage: 10,
          confidence: 75,
          reasoning: 'Parsed from textual response due to output format variance.',
          engine: 'gemini',
        });
      }
    } catch (error: any) {
      console.error('AI Forecast error — falling back to local engine:', error.message);
      res.json(localQuantForecast(symbol || 'KAS', Number(price) || 0, Number(change24h) || 0));
    }
  });

  // Vite development vs production asset delivery
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kaspa Lev App Server running on http://localhost:${PORT}`);
  });

  startKeeper();
}

startServer().catch((err) => {
  console.error('Failed to start full-stack server:', err);
  process.exit(1);
});
