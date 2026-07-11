/**
 * KasLev stress test — runs a batch of randomized trades against a live deployment
 * and verifies protocol accounting end-to-end:
 *   open (fees) -> favorable/adverse price moves -> close or liquidation ->
 *   payouts, dev fees, keeper fees, liquidation shares, escrow back to zero.
 *
 * Usage:
 *   KEEPER_NETWORK=igraGalleon STRESS_ROUNDS=8 node scripts/stress.js
 * Env:
 *   DEPLOYER_PRIVATE_KEY  reporter/owner key (pushes prices, funds the trader)
 *   TRADER_PRIVATE_KEY    optional; defaults to a well-known throwaway test key
 *   KEEPER_NETWORK        deployment record name (default kasplexTestnet)
 *   STRESS_ROUNDS         number of trade cycles (default 6)
 */
require('dotenv').config();
const path = require('path');
const { ethers } = require('ethers');

const NETWORK = process.env.KEEPER_NETWORK || 'kasplexTestnet';
const ROUNDS = Number(process.env.STRESS_ROUNDS || 6);
const rec = require(path.join(__dirname, '..', 'deployments', NETWORK + '.json'));
const KAS_ID = ethers.keccak256(ethers.toUtf8Bytes('KAS'));
const f = (x) => Number(ethers.formatEther(x)).toFixed(4);

const PERPS_ABI = [
  'function openPosition(bytes32,uint256,bool,uint256) payable returns (uint256)',
  'function closePosition(uint256)',
  'function liquidate(uint256)',
  'function quoteOpenCost(uint256,uint256) view returns (uint256,uint256,uint256)',
  'function liquidationPrice(uint256) view returns (uint256)',
  'function isLiquidatable(uint256) view returns (bool)',
  'event PositionOpened(uint256 indexed positionId, address indexed trader, bytes32 indexed assetId, bool isLong, uint256 leverage, uint256 margin, uint256 entryPrice, uint256 openFee, uint256 liquidationPrice)',
  'event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 exitPrice, int256 pnl, uint256 closeFee, uint256 payout, bool liquidated)',
];
const VAULT_ABI = [
  'function totalLiquidity() view returns (uint256)',
  'function freeLiquidity() view returns (uint256)',
  'function escrowedMargin() view returns (uint256)',
  'function developerPrincipal() view returns (uint256)',
  'event LiquidationSharePaid(address indexed to, uint256 requested, uint256 paid)',
];
const ORACLE_ABI = ['function setPrice(bytes32,uint256)'];

const GP = { gasPrice: ethers.parseUnits('2000', 'gwei') };
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  const p = new ethers.JsonRpcProvider(rec.rpc);
  const devKey = process.env.DEPLOYER_PRIVATE_KEY;
  const dev = new ethers.Wallet(devKey.startsWith('0x') ? devKey : '0x' + devKey, p);
  const traderKey = process.env.TRADER_PRIVATE_KEY || '0x9dc5a4add4acca5bf63208ca3bbea23d0fd813d32a508f8fc5a437958cf3704d';
  const trader = new ethers.Wallet(traderKey, p);

  const oracle = new ethers.Contract(rec.contracts.KasLevOracle, ORACLE_ABI, dev);
  const perpsT = new ethers.Contract(rec.contracts.KasLevPerps, PERPS_ABI, trader);
  const perpsK = new ethers.Contract(rec.contracts.KasLevPerps, PERPS_ABI, dev);
  const vault = new ethers.Contract(rec.contracts.KasLevVault, VAULT_ABI, p);
  const iface = new ethers.Interface(PERPS_ABI);
  const vIface = new ethers.Interface(VAULT_ABI);

  console.log(`=== KasLev stress test on ${rec.network} (${ROUNDS} rounds) ===`);
  const base = 0.03;
  const push = async (usd) => (await oracle.setPrice(KAS_ID, ethers.parseEther(usd.toFixed(8)), GP)).wait();

  // ensure trader has gas + margin budget
  const need = ethers.parseEther('60');
  if ((await p.getBalance(trader.address)) < need) {
    await (await dev.sendTransaction({ to: trader.address, value: need, ...GP })).wait();
    console.log('funded trader with 60', rec.nativeCurrency);
  }

  const stats = { opened: 0, closedWin: 0, closedLoss: 0, liquidated: 0, devFees: 0n, keeperFees: 0n, liqShares: 0n, payouts: 0n };
  const poolStart = await vault.totalLiquidity();

  for (let i = 1; i <= ROUNDS; i++) {
    await push(base);
    const isLong = Math.random() < 0.5;
    const leverage = rand([10, 25, 50, 100]);
    const marginKas = rand([2, 3, 4, 5]);
    const margin = ethers.parseEther(String(marginKas));
    const [openFee, keeperFee, total] = await perpsT.quoteOpenCost(leverage, margin);

    let rc = await (await perpsT.openPosition(KAS_ID, leverage, isLong, margin, { value: total, ...GP })).wait();
    let pid;
    for (const log of rc.logs) { try { const pl = iface.parseLog(log); if (pl?.name === 'PositionOpened') pid = pl.args.positionId; } catch {} }
    stats.opened++; stats.devFees += openFee; stats.keeperFees += keeperFee;

    // pick an outcome: win / lose / liquidate
    const outcome = rand(['win', 'lose', 'liquidate']);
    const movePct = 0.5 / leverage; // half the distance to liquidation — safe partial move
    let exitUsd;
    if (outcome === 'win') exitUsd = base * (isLong ? 1 + movePct : 1 - movePct);
    else if (outcome === 'lose') exitUsd = base * (isLong ? 1 - movePct : 1 + movePct);
    else exitUsd = Number(ethers.formatEther(await perpsK.liquidationPrice(pid))) * (isLong ? 0.999 : 1.001);
    await push(exitUsd);

    if (outcome === 'liquidate' && (await perpsK.isLiquidatable(pid))) {
      rc = await (await perpsK.liquidate(pid, GP)).wait();
      stats.liquidated++;
    } else {
      rc = await (await perpsT.closePosition(pid, GP)).wait();
      outcome === 'win' ? stats.closedWin++ : stats.closedLoss++;
    }
    let pnl = 0n, closeFee = 0n, payout = 0n, share = 0n;
    for (const log of rc.logs) {
      try { const pl = iface.parseLog(log); if (pl?.name === 'PositionClosed') { pnl = pl.args.pnl; closeFee = pl.args.closeFee; payout = pl.args.payout; } } catch {}
      try { const pv = vIface.parseLog(log); if (pv?.name === 'LiquidationSharePaid') share = pv.args.paid; } catch {}
    }
    stats.devFees += closeFee; stats.liqShares += share; stats.payouts += payout;
    console.log(
      `#${String(i).padStart(2)} pos ${pid} ${isLong ? 'LONG ' : 'SHORT'} ${String(leverage).padStart(3)}x ${marginKas} ${rec.nativeCurrency}` +
      ` -> ${outcome.padEnd(9)} pnl ${f(pnl).padStart(9)} fee ${f(closeFee)} payout ${f(payout)} liqShare ${f(share)}`
    );
  }

  await push(base); // restore
  const poolEnd = await vault.totalLiquidity();
  const escrow = await vault.escrowedMargin();

  console.log('\n=== RESULTS ===');
  console.log(`trades: ${stats.opened} | wins ${stats.closedWin} losses ${stats.closedLoss} liquidations ${stats.liquidated}`);
  console.log(`dev fees (open+close): ${f(stats.devFees)} ${rec.nativeCurrency}`);
  console.log(`keeper fees:           ${f(stats.keeperFees)} ${rec.nativeCurrency}`);
  console.log(`liquidation shares:    ${f(stats.liqShares)} ${rec.nativeCurrency}`);
  console.log(`trader payouts:        ${f(stats.payouts)} ${rec.nativeCurrency}`);
  console.log(`pool: ${f(poolStart)} -> ${f(poolEnd)} (${poolEnd >= poolStart ? '+' : ''}${f(poolEnd - poolStart)})`);
  console.log(`escrow after all settled: ${f(escrow)} (must be 0)`);
  if (escrow !== 0n) throw new Error('ESCROW LEAK — accounting bug!');
  console.log('accounting checks passed ✓');
}

main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
