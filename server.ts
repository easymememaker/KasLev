/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  
  // API route for live Kaspa (KAS) price proxy to prevent CORS issues
  app.get('/api/kaspa-price', async (req, res) => {
    try {
      // Source 1: Gate.io API
      try {
        const response = await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=KAS_USDT');
        if (response.ok) {
          const json: any = await response.json();
          if (Array.isArray(json) && json.length > 0) {
            const ticker = json[0];
            const lastPrice = parseFloat(ticker.last);
            const changePct = parseFloat(ticker.change_percentage || '0');
            if (!isNaN(lastPrice) && lastPrice > 0) {
              return res.json({
                price: lastPrice,
                change24h: changePct,
                source: 'Gate.io (L1 Real Oracle)'
              });
            }
          }
        }
      } catch (e: any) {
        console.warn('Backend proxy Gate.io fetch failed, trying MEXC...', e.message);
      }

      // Source 2: MEXC API
      try {
        const response = await fetch('https://api.mexc.com/api/v3/ticker/24hr?symbol=KASUSDT');
        if (response.ok) {
          const json: any = await response.json();
          const lastPrice = parseFloat(json.lastPrice);
          const changePct = parseFloat(json.priceChangePercent || '0');
          if (!isNaN(lastPrice) && lastPrice > 0) {
            return res.json({
              price: lastPrice,
              change24h: changePct,
              source: 'MEXC (L1 Real Oracle)'
            });
          }
        }
      } catch (e: any) {
        console.warn('Backend proxy MEXC fetch failed, trying CoinGecko...', e.message);
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
              return res.json({
                price: lastPrice,
                change24h: changePct,
                source: 'CoinGecko (L1 Real Oracle)'
              });
            }
          }
        }
      } catch (e: any) {
        console.warn('Backend proxy CoinGecko fetch failed', e.message);
      }

      // Fallback response with simulated pricing
      return res.json({
        price: 0.1542,
        change24h: 2.45,
        source: 'Kaspa Proxy Fallback (Simulated)'
      });
    } catch (error: any) {
      console.error('Proxy overall price fetch failure:', error);
      res.json({
        price: 0.1542,
        change24h: 2.45,
        source: 'Kaspa Proxy Failure (Simulated)'
      });
    }
  });

  // API route for Gemini AI Forecast & Trade Recommendations
  app.post('/api/ai-forecast', async (req, res) => {
    try {
      const { symbol, price, change24h, history, l2Active } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured' });
      }

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
        res.json(json);
      } catch (err) {
        // Fallback parser for text
        console.warn('Failed parsing JSON, sending raw text:', text);
        res.json({
          forecast: text,
          action: text.toUpperCase().includes('LONG') ? 'LONG' : text.toUpperCase().includes('SHORT') ? 'SHORT' : 'HOLD',
          leverage: 10,
          confidence: 75,
          reasoning: 'Parsed from textual response due to output format variance.'
        });
      }
    } catch (error: any) {
      console.error('AI Forecast error:', error);
      res.status(500).json({ error: error.message || 'AI analysis failed' });
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
}

startServer().catch((err) => {
  console.error('Failed to start full-stack server:', err);
  process.exit(1);
});
