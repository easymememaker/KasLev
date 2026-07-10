# KasLev Protocol — Smart Contracts

Open-source, native-KAS leveraged trading contracts for the **Kaspa EVM Layer-2**
ecosystem (Kasplex / Igra / Sparkle, available around the Kaspa Toccata upgrade).

> Kaspa L1 (GHOSTDAG) does not execute general smart contracts. KasLev's on-chain logic
> therefore targets the Kaspa EVM L2 layer, where the native gas/collateral asset is **KAS**
> (18 decimals). This matches the `0x…` L2 addresses already used by the KasLev app.

Everything here is intentionally small, readable, and auditable — the whole protocol is a
handful of focused contracts with no hidden functions, fees, or withdrawal paths.

---

## Contracts

| Contract | Responsibility |
|---|---|
| `KasLevOracle.sol` | Transparent, keeper-updated USD price feed (1e18-scaled). Reporter set is public; every write is event-logged. Swappable behind `IPriceOracle`. |
| `KasLevAssetRegistry.sol` | Public list of tradeable markets ("pools"). **Only the developer/owner may list assets** — the controlled-listing rule that guards against fake tokens. |
| `KasLevVault.sol` | Custodies **all** liquidity in native KAS. Enforces the developer seed lock and the principal-only withdrawal. No owner drain path exists. |
| `KasLevPerps.sol` | The trading engine: long/short, transparent tiered fees, PnL, liquidation, emergency close. Holds no funds. |

Deployment topology: `Perps` reads prices from `Oracle`, checks markets against `Registry`,
and moves money **only** through `Vault`. The vault accepts settlement calls from exactly one
address (the perps engine), fixed once at wiring time.

---

## How this maps to the KasLev spec

| Spec requirement | Where it's enforced |
|---|---|
| Initial liquidity locked 100 days | `KasLevVault.depositInitialLiquidity` sets `lockExpiry = now + lockDuration` |
| Developer may withdraw **only** the original principal | `KasLevVault.withdrawDeveloperPrincipal` caps payout at `developerPrincipal`, once, after unlock |
| Accumulated liquidity permanently belongs to the protocol | No code path lets the developer/owner take more than the principal |
| Developer revenue = trading fees only | Fees routed straight to `devFeeWallet`; they never enter the vault |
| No hidden fees / privileged accounts / backdoors | No owner sweep; `MAX_FEE_BPS` (10%) caps every tier; all params emit events |
| ≤50× → 1% open + 1% close | `getFeeBps` (`stdFeeBps = 100`), charged on open and close |
| >50× → 5% (configurable thresholds) | `highRiskFeeBps = 500`; tiers configurable via `setFeeSchedule` within the cap |
| Long **and** short positions | `openPosition(..., bool isLong, ...)` |
| Network fees paid by the trader | Trader is `msg.sender` on every call |
| Fastest possible exit / Emergency Close | `closePosition` always available, even while paused |
| Only the developer adds new assets | `KasLevAssetRegistry.listAsset` is `onlyOwner` |
| Fee wallet configurable at deployment & visible | `devFeeWallet` constructor arg + `setDevFeeWallet` (event-logged) |

The fee tiers and liquidation formula are a 1:1 match of the app's `src/utils/math.ts`.

---

## Fee schedule (default)

| Leverage | Fee (open & close) |
|---|---|
| ≤ 50× | 1.00% |
| 51× – 9,999× | 5.00% |
| 10,000× – 99,999× | 1.00% |
| 100,000× – 999,999× | 2.00% |
| ≥ 1,000,000× | 5.00% |

Fees are charged on **margin** (not notional), matching the app. Every tier is hard-capped
at 10% (`MAX_FEE_BPS`) so the owner can never set a predatory rate.

### Keeper fee (self-funding the oracle & liquidations)

On top of the developer trading fee, each position **open** pays a small flat **keeper fee**
(KAS) routed to `keeperWallet`. This is *not* developer profit — it reimburses the gas of the
two ongoing keeper jobs (oracle price updates + liquidations) so the protocol sustains itself.
It is a transparent parameter: publicly readable (`keeperFee`), hard-capped at
`MAX_KEEPER_FEE` (5 KAS), and every change emits `KeeperConfigUpdated`. Set it via
`setKeeperConfig(keeperWallet, keeperFee)`; `quoteOpenCost` returns it so the UI shows the full
cost up front.

Measured on Kasplex testnet, one oracle update costs ~0.07 KAS of gas and a liquidation
~0.16 KAS — both far below the trading fees a market of any real size generates.

### PnL & liquidation

```
pnl_KAS      = ±margin · leverage · (currentPrice − entryPrice) / entryPrice
marginRatio  = (1 / leverage) − maintenanceMargin      (default maintenance = 0.1%)
liqPrice     = entryPrice · (1 ∓ marginRatio)          (long: −, short: +)
```

Because PnL depends only on the traded asset's **price ratio**, no separate KAS/USD oracle
is needed on-chain.

---

## Build, test, deploy

```bash
cd contracts
npm install
npm run compile      # solc 0.8.24, optimizer + viaIR
npm test             # 17 passing
```

Deploy (parameters are all env-overridable — see `scripts/deploy.js`):

```bash
# Local dry run
SEED_KAS=5000 DEPOSIT_SEED=true npm run deploy

# Kaspa L2 testnet (fill the RPC + key first)
KASPA_L2_RPC_URL=<rpc> DEPLOYER_PRIVATE_KEY=<key> \
DEV_FEE_WALLET=<addr> SEED_KAS=30000 LOCK_DAYS=100 \
npm run deploy -- --network kaspaL2Testnet
```

| Env var | Default | Meaning |
|---|---|---|
| `SEED_KAS` | `30000` | Initial locked liquidity (whole KAS). You hold 40,000 — lock 30k, keep the rest for gas. |
| `LOCK_DAYS` | `100` | Seed lock duration |
| `DEV_FEE_WALLET` | deployer | Receives trading fees |
| `DEVELOPER_WALLET` | deployer | Funds & later reclaims the seed |
| `DEPOSIT_SEED` | `false` | Deposit the seed during deploy |

---

## Keeper bot

`scripts/keeper.js` runs the two public keeper jobs against a deployment (addresses read from
`deployments/<network>.json`):

1. **Oracle upkeep** — pushes the live KAS price on-chain each cycle (reporter key required).
2. **Liquidations** — scans every open position and liquidates any that crossed maintenance
   margin (permissionless — anyone can run this).

```bash
# one cycle then exit
KEEPER_ONCE=true npm run keeper
# continuous (default 30s interval; override with KEEPER_INTERVAL_MS)
npm run keeper
```

The keeper's gas is funded by the on-chain keeper fee described above, making the loop
economically self-sustaining once trading volume exists.

## Security notes & honest caveats

- **The seed is working liquidity.** It backs trader payouts, so it is subject to normal pool
  P&L while active. The developer can never withdraw *more* than the principal, but if traders
  win heavily the recoverable amount can be less — that is the LP risk the seed exists to take.
- **Oracle is currently keeper-pushed** (mirrors the app's price proxy). It is deliberately
  behind the `IPriceOracle` interface so a production deployment can swap in a decentralized
  median/TWAP feed without touching protocol logic.
- **Not yet audited.** These contracts ship with a full test suite and are structured for
  public review, but an independent audit is required before mainnet value is at risk.
- Reentrancy is guarded (`ReentrancyGuard` + checks-effects-interactions), value transfers use
  OpenZeppelin `Address.sendValue`, and `pause()` can only ever block *opening* new positions.

MIT licensed. Inspect, compile, and verify everything yourself.
