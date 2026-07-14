# Free public deployment (testnet trial)

Goal: put the app on a free host so anyone can test against the live testnets.
One Node process serves the site, the API, **and** the oracle keeper.

## Recommended: Render free tier (~10 minutes)

**1. Push the repo to GitHub** (once):

```bash
gh auth login                 # sign in with your GitHub account
gh repo create KasLev --public --source . --push
```

Secrets are safe: `.env` files are gitignored — verify with `git ls-files | grep .env`
(only `.env.example` files should appear).

**2. Create the Render service:**

- Sign up at <https://render.com> (log in with GitHub — free, no card).
- *New → Blueprint* → pick the `KasLev` repo. Render reads `render.yaml` and
  configures everything (free plan, build, health check).
- When prompted for environment variables, set:
  - `KEEPER_PRIVATE_KEY` — the **testnet** reporter key (same one as
    `contracts/.env`). This wallet holds only faucet coins; still, never reuse a
    real-money key here.
  - `GEMINI_API_KEY` — optional.
- Deploy. First build takes a few minutes; you get `https://kaslev.onrender.com`.

**3. Keep it awake (free-tier catch):**

Render's free tier sleeps a service after ~15 minutes without traffic — a
sleeping keeper means the oracles go stale (the UI will honestly show
*Oracle Stale* and on-chain trading pauses until it wakes).

Fix: create a free monitor at <https://uptimerobot.com> that pings
`https://<your-app>.onrender.com/healthz` every 5 minutes. That keeps the
service warm 24/7 and doubles as an uptime alert. `/healthz` also reports
`keeper: fresh | degraded | off` so the monitor catches oracle problems too.

**4. Verify public readiness:**

- `https://<your-app>.onrender.com/healthz` → `{"ok":true,...,"keeper":"fresh"}`
- Open the app → trade terminal chip shows **Oracle Live**.
- Connect MetaMask → open/close a small testnet position end-to-end.

## Alternatives

- **Any Docker host** (Koyeb free, Fly.io, a friend's VPS): the included
  `Dockerfile` builds the same single container. `docker build -t kaslev . &&
  docker run -p 3000:3000 -e KEEPER_PRIVATE_KEY=... kaslev`
- **Always-on VPS** (best experience, no sleep): see README → *Production deploy*.

## Keeper economics on the free host

The keeper pushes a price every 150s to both testnets. Kasplex gas is negligible;
Igra enforces 2000 gwei, ≈ 26 iKAS/day. Top the wallet up from the faucets when
`/api/keeper/status` shows a rising `lastError` about funds.
