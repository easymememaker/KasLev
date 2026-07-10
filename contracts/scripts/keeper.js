/**
 * KasLev keeper bot.
 *
 * Two public, transparent jobs — both funded by the on-chain keeper fee that traders pay:
 *   1. ORACLE UPKEEP  — periodically push the live KAS price on-chain so settlements are fair.
 *   2. LIQUIDATIONS   — scan open positions and liquidate any that crossed maintenance margin,
 *                       protecting pool solvency.
 *
 * Anyone can run this (liquidations are permissionless); the price push requires a reporter
 * key. It reads deployed addresses from deployments/<network>.json so it stays in sync.
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY / KEEPER_PRIVATE_KEY  signer (must be an oracle reporter to push price)
 *   KASPA_L2_RPC_URL                           RPC (default Kasplex testnet)
 *   KEEPER_NETWORK                             deployment file name (default kasplexTestnet)
 *   KEEPER_INTERVAL_MS                         loop interval (default 30000)
 *   KEEPER_ONCE                                "true" => run a single cycle then exit
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const NETWORK = process.env.KEEPER_NETWORK || 'kasplexTestnet';
const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS || 30000);
const KAS_ID = ethers.keccak256(ethers.toUtf8Bytes('KAS'));

const ORACLE_ABI = ['function setPrice(bytes32,uint256)', 'function getPrice(bytes32) view returns (uint256,uint256)', 'function isReporter(address) view returns (bool)'];
const PERPS_ABI = [
  'function nextPositionId() view returns (uint256)',
  'function positions(uint256) view returns (address trader, bytes32 assetId, bool isLong, bool closed, uint256 leverage, uint256 margin, uint256 entryPrice, uint16 feeBps, uint256 openedAt)',
  'function isLiquidatable(uint256) view returns (bool)',
  'function liquidate(uint256)',
];

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function livePrice() {
  // Prefer the app's own proxy; fall back to Gate.io directly.
  try {
    const r = await fetch('http://localhost:3000/api/kaspa-price');
    const j = await r.json();
    if (j && j.price > 0) return { usd: j.price, src: j.source };
  } catch {}
  try {
    const r = await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=KAS_USDT');
    const j = await r.json();
    if (Array.isArray(j) && j[0]) return { usd: parseFloat(j[0].last), src: 'Gate.io' };
  } catch {}
  return null;
}

async function cycle(provider, signer, oracle, perps) {
  // --- 1. Oracle upkeep ---
  const price = await livePrice();
  if (price && price.usd > 0) {
    const tx = await oracle.setPrice(KAS_ID, ethers.parseEther(price.usd.toFixed(8)));
    await tx.wait();
    log(`oracle KAS = $${price.usd} (${price.src})  tx ${tx.hash.slice(0, 12)}…`);
  } else {
    log('WARN: could not fetch a live price this cycle');
  }

  // --- 2. Liquidation scan ---
  const next = Number(await perps.nextPositionId());
  let open = 0;
  let liquidated = 0;
  for (let id = 1; id < next; id++) {
    const p = await perps.positions(id);
    if (p.closed) continue;
    open++;
    if (await perps.isLiquidatable(id)) {
      try {
        const tx = await perps.liquidate(id);
        await tx.wait();
        liquidated++;
        log(`⚡ liquidated position #${id} (trader ${p.trader.slice(0, 8)}…)  tx ${tx.hash.slice(0, 12)}…`);
      } catch (e) {
        log(`liquidate #${id} failed:`, e.shortMessage || e.message);
      }
    }
  }
  log(`scan: ${open} open position(s), ${liquidated} liquidated`);
}

async function main() {
  const recPath = path.join(__dirname, '..', 'deployments', NETWORK + '.json');
  if (!fs.existsSync(recPath)) throw new Error('no deployment record at ' + recPath + ' — deploy first');
  const rec = JSON.parse(fs.readFileSync(recPath, 'utf8'));

  const provider = new ethers.JsonRpcProvider(process.env.KASPA_L2_RPC_URL || rec.rpc);
  const key = process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error('set KEEPER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env');
  const signer = new ethers.Wallet(key.startsWith('0x') ? key : '0x' + key, provider);

  const oracle = new ethers.Contract(rec.contracts.KasLevOracle, ORACLE_ABI, signer);
  const perps = new ethers.Contract(rec.contracts.KasLevPerps, PERPS_ABI, signer);

  log(`KasLev keeper started on ${rec.network} (chain ${rec.chainId})`);
  log(`signer ${signer.address}  reporter=${await oracle.isReporter(signer.address)}`);
  log(`perps ${rec.contracts.KasLevPerps}`);

  const once = (process.env.KEEPER_ONCE || '').toLowerCase() === 'true';
  do {
    try {
      await cycle(provider, signer, oracle, perps);
    } catch (e) {
      log('cycle error:', e.shortMessage || e.message);
    }
    if (!once) await new Promise((r) => setTimeout(r, INTERVAL));
  } while (!once);
}

main().catch((e) => { console.error(e); process.exit(1); });
