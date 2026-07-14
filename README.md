---
title: KasLev
emoji: 📈
colorFrom: green
colorTo: gray
sdk: docker
app_port: 3000
pinned: false
---

# KasLev — Kaspa High-Leverage L2 Protocol

Open-source perpetuals trading on Kaspa EVM Layer-2 testnets. Real contracts, a
manipulation-resistant median oracle, a time-locked developer seed, and every house
rule readable on-chain.

> **Status: PUBLIC TESTNET.** Both deployments below use valueless testnet coins.
> Mainnet comes after this public trial.

## Try it (public testers)

1. Open the app and click **Connect Wallet → MetaMask**. The app adds/switches the
   network for you automatically.
2. Get free testnet gas:
   - Kasplex zkEVM KAS: <https://faucet.zealousswap.com/> (or <https://app.kaspafinance.io/faucets>)
   - Igra Galleon iKAS: <https://app.kaspafinance.io/faucets>
3. Pick collateral + leverage in the Terminal and open a LONG/SHORT. Fees, keeper
   cost, and the exact total are quoted from the contract before you sign.
4. Watch your position live — PnL and liquidation price are read from the chain.
   Close any time; the keeper liquidates positions that cross maintenance margin.

The **Oracle Live / Stale** chip in the trade terminal tells you whether on-chain
trading is currently possible. If it's stale, the price keeper isn't running —
trades would revert (nothing is at risk; simulated trading still works).

## Live deployments

| | Kasplex zkEVM Testnet | Igra Galleon Testnet |
|---|---|---|
| Chain ID | 167012 | 38836 |
| RPC | `https://rpc.kasplextest.xyz` | `https://galleon-testnet.igralabs.com:8545` |
| Explorer | [explorer.testnet.kasplextest.xyz](https://explorer.testnet.kasplextest.xyz) | [explorer.galleon-testnet.igralabs.com](https://explorer.galleon-testnet.igralabs.com) |
| Perps Engine | `0x12EdcCE0875c3182300200d5ed235849342B393E` | `0xC13A26f28D9B1281A87b2e2BC14E0260F38C47B0` |
| Liquidity Vault | `0x1Ac0b02E1e41e944E1A8F93ffcF22caeF6CC26B7` | `0x048129c68A48Ded374e91D64bC1A567eD52964f1` |
| Median Oracle | `0x87C37c72378a616050a5503E472e36F901f61f1e` | `0xAe92b522836fBCe04491794cD841600792cA6fBE` |
| Asset Registry | `0xdaB29E9C6A11eB403Ab8AeF6459751610b0a23a3` | `0x3D19d67dd23093a74027e096Ddcf6874D336582d` |

The full address matrix with explorer links is also in the app under **Protocol Audits**.

### Testnet-only parameters

For a meaningful public trial on small pools, `maxPayoutPoolBps` is set to the
contract's hard maximum (20% of free liquidity per payout), and the price
freshness window (`maxAge` / `maxPriceAge`) is widened to 30 minutes so the free
GitHub-Actions keeper cadence keeps trading live. Mainnet ships with conservative
caps and the strict 300s window. Everything else (fee tiers, 5% liquidation
share, 100-day seed lock) already runs at intended values.

### Free public hosting (how the demo runs)

- **Site**: GitHub Pages — static SPA built by `.github/workflows/pages.yml`.
  On the static host the app talks straight to the chain RPCs and public price
  APIs; the AI tab uses the local momentum heuristic.
- **Keeper**: `.github/workflows/keeper.yml` runs every ~10 minutes and pushes
  the live KAS price to both testnet oracles (needs the `KEEPER_PRIVATE_KEY`
  repository secret). The full-stack server (`npm run dev` / Docker) remains the
  richer deployment for hosts that allow long-lived processes.

## Run it yourself

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev          # dev server + API + oracle keeper on :3000
```

### Environment

| File | Variable | Purpose |
|---|---|---|
| `.env` | `GEMINI_API_KEY` | Optional. Cloud AI for the strategies tab; without it a local, honestly-labeled quant heuristic answers instead. |
| `.env` | `PORT` | Server port (default 3000). |
| `.env` | `KEEPER_DISABLED` | `true` disables the built-in oracle keeper. |
| `.env` | `KEEPER_INTERVAL_MS` | Keeper push cadence (default 150000; oracle maxAge is 300s). |
| `contracts/.env` | `DEPLOYER_PRIVATE_KEY` / `KEEPER_PRIVATE_KEY` | Reporter key the keeper signs oracle pushes with. Never committed; never sent to the browser. |

### Production deploy (any Node host / VPS)

```bash
npm ci
npm run build                      # vite build + server bundle -> dist/
NODE_ENV=production node dist/server.cjs
```

One process serves the static app, the `/api` routes, **and** the oracle keeper —
as long as it runs, both testnets stay priced and liquidations execute. Put a
reverse proxy (Caddy/nginx) in front for TLS; `/api` routes are rate-limited
in-process. Keep the keeper wallet topped up from the faucets (it pays push gas;
Igra enforces 2000 gwei minimum).

## Architecture

- `contracts/` — Solidity 0.8.24 (Perps engine, Vault, median Oracle, Registry),
  Hardhat tests (`npx hardhat test`, 27 passing), deploy + standalone keeper scripts.
- `server.ts` — Express + Vite middleware, live price proxy, AI forecast endpoint,
  integrated keeper service, `/api/keeper/status`.
- `src/` — React 19 + Tailwind terminal: TradingView-grade chart
  (lightweight-charts), on-chain position sync, oracle health surfacing, wallet
  connect (MetaMask for real trades; Kasware L1).

## Safety model (enforced by code, shown in-app)

- Developer seed is time-locked 100 days; only the original principal is ever
  withdrawable (`StillLocked()` / `AlreadyWithdrawn()` guards — no owner drain path).
- Settlement price is the **median** of independent reporters; below `minSources`
  fresh reports the protocol refuses to trade instead of settling on a thin price.
- Payouts are capped against pool insolvency; open-position escrow can never be
  touched by the developer withdrawal.
- Every fee tier is deterministic, capped at 10%, and quoted on-chain before signing.
