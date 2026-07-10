/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface KaspaPriceData {
  price: number;
  change24h: number;
  source: string;
  isLoading: boolean;
  lastUpdated: string;
}

const DEFAULT_KAS_PRICE = 0.15420;
const DEFAULT_KAS_CHANGE = 2.45;

export function useKaspaPrice(pollingIntervalMs: number = 10000) {
  const [data, setData] = useState<KaspaPriceData>({
    price: DEFAULT_KAS_PRICE,
    change24h: DEFAULT_KAS_CHANGE,
    source: 'Simulation (Offline Fallback)',
    isLoading: true,
    lastUpdated: new Date().toLocaleTimeString(),
  });

  const lastPriceRef = useRef<number>(DEFAULT_KAS_PRICE);
  const lastChangeRef = useRef<number>(DEFAULT_KAS_CHANGE);

  const fetchLivePrice = useCallback(async () => {
    // Primary Source: Secure, CORS-free Backend Proxy Route
    try {
      const response = await fetch('/api/kaspa-price');
      if (response.ok) {
        const json = await response.json();
        const lastPrice = parseFloat(json.price);
        const changePct = parseFloat(json.change24h);
        if (!isNaN(lastPrice) && lastPrice > 0) {
          lastPriceRef.current = lastPrice;
          lastChangeRef.current = changePct;
          setData({
            price: lastPrice,
            change24h: changePct,
            source: json.source || 'Kaspa L1 Oracle Proxy',
            isLoading: false,
            lastUpdated: new Date().toLocaleTimeString(),
          });
          return;
        }
      }
    } catch (e) {
      console.warn('Backend proxy price fetch failed, falling back to client-side direct fetches...', e);
    }

    // Secondary Source 1: Direct Gate.io API (subject to CORS & sandbox constraints)
    try {
      const response = await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=KAS_USDT');
      if (response.ok) {
        const json = await response.json();
        if (Array.isArray(json) && json.length > 0) {
          const ticker = json[0];
          const lastPrice = parseFloat(ticker.last);
          const changePct = parseFloat(ticker.change_percentage || '0');
          if (!isNaN(lastPrice) && lastPrice > 0) {
            lastPriceRef.current = lastPrice;
            lastChangeRef.current = changePct;
            setData({
              price: lastPrice,
              change24h: changePct,
              source: 'Gate.io (Direct)',
              isLoading: false,
              lastUpdated: new Date().toLocaleTimeString(),
            });
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Direct Gate.io fetch failed, trying MEXC...', e);
    }

    // Secondary Source 2: Direct MEXC API (as fallback)
    try {
      const response = await fetch('https://api.mexc.com/api/v3/ticker/24hr?symbol=KASUSDT');
      if (response.ok) {
        const json = await response.json();
        const lastPrice = parseFloat(json.lastPrice);
        const changePct = parseFloat(json.priceChangePercent || '0');
        if (!isNaN(lastPrice) && lastPrice > 0) {
          lastPriceRef.current = lastPrice;
          lastChangeRef.current = changePct;
          setData({
            price: lastPrice,
            change24h: changePct,
            source: 'MEXC Market API',
            isLoading: false,
            lastUpdated: new Date().toLocaleTimeString(),
          });
          return;
        }
      }
    } catch (e) {
      console.warn('MEXC fetch failed, trying CoinGecko fallback...', e);
    }

    // Source 3: CoinGecko API (as fallback)
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true');
      if (response.ok) {
        const json = await response.json();
        if (json.kaspa) {
          const lastPrice = parseFloat(json.kaspa.usd);
          const changePct = parseFloat(json.kaspa.usd_24h_change || '0');
          if (!isNaN(lastPrice) && lastPrice > 0) {
            lastPriceRef.current = lastPrice;
            lastChangeRef.current = changePct;
            setData({
              price: lastPrice,
              change24h: changePct,
              source: 'CoinGecko Oracle API',
              isLoading: false,
              lastUpdated: new Date().toLocaleTimeString(),
            });
            return;
          }
        }
      }
    } catch (e) {
      console.warn('CoinGecko fetch failed. Reverting to highly optimized micro-tick simulator.', e);
    }

    // Fallback: Simulation with micro-fluctuations around last valid price
    const currentSimulatedPrice = lastPriceRef.current;
    const currentSimulatedChange = lastChangeRef.current;
    
    // Add minor micro-tick fluctuations (-0.1% to +0.1%)
    const microFluctuation = (Math.random() - 0.49) * 0.001 * currentSimulatedPrice;
    const nextPrice = Math.max(0.01, currentSimulatedPrice + microFluctuation);
    const nextChange = currentSimulatedChange + (microFluctuation / currentSimulatedPrice) * 100;

    lastPriceRef.current = nextPrice;
    lastChangeRef.current = nextChange;

    setData({
      price: parseFloat(nextPrice.toFixed(6)),
      change24h: parseFloat(nextChange.toFixed(2)),
      source: 'Kaspa Toccata Block Engine (Simulated)',
      isLoading: false,
      lastUpdated: new Date().toLocaleTimeString(),
    });
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchLivePrice();

    // Setup polling interval
    const interval = setInterval(fetchLivePrice, pollingIntervalMs);
    return () => clearInterval(interval);
  }, [fetchLivePrice, pollingIntervalMs]);

  return {
    ...data,
    refetch: fetchLivePrice,
  };
}
