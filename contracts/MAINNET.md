# Mainnet deployment — pre-flight & runbook

Everything here spends **real KAS**. The deploy itself is one command, but do the
pre-flight in order; each item exists because skipping it loses real money.

Live mainnet targets (already configured in `hardhat.config.js`):

| Network | chainId | RPC | Explorer |
|---|---|---|---|
| `kasplexMainnet` | 202555 | `https://evmrpc.kasplex.org` | <https://explorer.kasplex.org> |
| `igraMainnet` | 38833 | `https://rpc.igralabs.com:8545` | <https://explorer.igralabs.com> |

## Pre-flight checklist

1. **Independent security audit.** The vault holds user margin and the seed. Do not
   skip this for real funds.
2. **Fund the deployer wallet** on the target chain: deploy gas (small) plus
   `SEED_KAS` if `DEPOSIT_SEED=true`. The wallet currently holds **0 KAS on both
   mainnets** — nothing can deploy until it is funded. Use a fresh, dedicated key.
3. **Choose real parameters** in `contracts/.env`:
   - `SEED_KAS` (spec: 30000) and `LOCK_DAYS` (spec: 100).
   - Leave payout caps at contract defaults (`maxPayoutPoolBps = 200` = 2%).
     The 20% cap currently set on the TESTNETS is a testing convenience — do
     **not** replicate it with real liquidity.
4. **Plan ≥3 independent oracle reporters.** One reporter (today's testnet setup)
   means the house alone sets the settlement price — fine for a demo, not
   acceptable for real money. Each reporter: its own key, its own price source,
   its own infrastructure. After deploy:
   ```
   oracle.setReporter(<addr1..3>, true)
   oracle.setParams(300, 3)   // maxAge 300s, minSources 3
   ```
5. **Keeper redundancy.** At least two keeper processes on separate hosts
   (`KEEPER_NETWORK=<net> node scripts/keeper.js`, or two app-server instances),
   each funded for push gas. If all keepers die, trading pauses (safe) — but a
   paused mainnet is still a bad look.
6. **Verify Igra's minimum gas price** before deploying there (Galleon testnet
   enforced 2000 gwei; the config assumes mainnet does too).

## Deploy (one command per network)

```bash
cd contracts
npx hardhat run scripts/deploy.js --network kasplexMainnet   # or igraMainnet
```

This deploys Oracle → Registry → Vault → Perps, lists the KAS market, optionally
deposits the seed, and writes `deployments/<network>.json`.

## Post-deploy wiring

1. Add the new network (chainId, RPC, explorer, deployed addresses from the
   deployment record) to `src/web3/config.ts` `NETWORKS` and the `NetworkKey`
   type. The app server's integrated keeper iterates that same config, so it
   starts pricing the new chain on the next restart automatically.
2. Add the network to the app's network switcher.
3. Register reporters + `setParams` (step 4 above) and confirm the trade
   terminal's oracle chip reads **Live**.
4. Open and close one small real position from a team wallet before announcing.

## Explicitly out of scope for the deploy script

- It never touches funds beyond gas + the optional seed deposit.
- It cannot shorten the seed lock or raise caps above contract hard maxima —
  those guards live in the contracts themselves.
