const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const KAS_ID = ethers.keccak256(ethers.toUtf8Bytes('KAS'));
const PRICE_003 = ethers.parseEther('0.03'); // $0.03, 1e18 scaled
const SEED = ethers.parseEther('5000'); // test seed (accounts hold 10,000 ETH by default)
const LOCK_DAYS = 100n;
const LOCK = LOCK_DAYS * 24n * 60n * 60n;

async function deployFixture() {
  const [owner, developer, devFee, trader, keeper] = await ethers.getSigners();

  const oracle = await (await ethers.getContractFactory('KasLevOracle')).deploy(owner.address);
  const registry = await (await ethers.getContractFactory('KasLevAssetRegistry')).deploy(owner.address);
  const vault = await (await ethers.getContractFactory('KasLevVault')).deploy(owner.address, developer.address, LOCK);
  const perps = await (await ethers.getContractFactory('KasLevPerps')).deploy(
    owner.address,
    await vault.getAddress(),
    await registry.getAddress(),
    await oracle.getAddress(),
    devFee.address,
  );

  await vault.setPerps(await perps.getAddress());
  await registry.listAsset('KAS', 1_000_000);
  await oracle.setPrice(KAS_ID, PRICE_003);
  await vault.connect(developer).depositInitialLiquidity({ value: SEED });

  return { owner, developer, devFee, trader, keeper, oracle, registry, vault, perps };
}

describe('KasLevAssetRegistry', () => {
  it('lists markets only via the owner (developer-controlled listing)', async () => {
    const { registry, trader } = await loadFixture(deployFixture);
    await expect(registry.connect(trader).listAsset('NACHO', 100)).to.be.reverted;
    await registry.listAsset('NACHO', 100);
    const id = ethers.keccak256(ethers.toUtf8Bytes('NACHO'));
    expect(await registry.isTradeable(id)).to.equal(true);
    expect(await registry.maxLeverageOf(id)).to.equal(100n);
  });

  it('can disable a market without delisting', async () => {
    const { registry } = await loadFixture(deployFixture);
    await registry.setEnabled(KAS_ID, false);
    expect(await registry.isTradeable(KAS_ID)).to.equal(false);
  });
});

describe('KasLevOracle', () => {
  it('rejects price writes from non-reporters and zero prices', async () => {
    const { oracle, trader } = await loadFixture(deployFixture);
    await expect(oracle.connect(trader).setPrice(KAS_ID, PRICE_003)).to.be.reverted;
    await expect(oracle.setPrice(KAS_ID, 0)).to.be.reverted;
  });

  it('returns the MEDIAN of fresh reporter prices (manipulation-resistant)', async () => {
    const { oracle, owner, trader, keeper } = await loadFixture(deployFixture);
    // owner already reported 0.030 in the fixture. Add two independent reporters.
    await oracle.setReporter(trader.address, true);
    await oracle.setReporter(keeper.address, true);
    await oracle.connect(trader).setPrice(KAS_ID, ethers.parseEther('0.031'));
    await oracle.connect(keeper).setPrice(KAS_ID, ethers.parseEther('0.050')); // outlier
    // prices {0.030, 0.031, 0.050} -> median 0.031 (the outlier can't move it)
    const [price] = await oracle.getPrice(KAS_ID);
    expect(price).to.equal(ethers.parseEther('0.031'));
    expect(await oracle.freshSourceCount(KAS_ID)).to.equal(3);
  });

  it('refuses to price (and blocks trading) when fresh sources < minSources', async () => {
    const { oracle, perps, trader } = await loadFixture(deployFixture);
    await oracle.setParams(300, 2); // require 2 fresh sources; fixture only has 1
    const [price] = await oracle.getPrice(KAS_ID);
    expect(price).to.equal(0n);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await expect(
      perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total }),
    ).to.be.revertedWithCustomError(perps, 'ZeroPrice');
  });
});

describe('Fee schedule (mirrors src/utils/math.ts getFeePercentage)', () => {
  it('applies the exact configured tiers', async () => {
    const { perps } = await loadFixture(deployFixture);
    expect(await perps.getFeeBps(10)).to.equal(100); // <=50x -> 1%
    expect(await perps.getFeeBps(50)).to.equal(100);
    expect(await perps.getFeeBps(51)).to.equal(500); // high-risk -> 5%
    expect(await perps.getFeeBps(9_999)).to.equal(500);
    expect(await perps.getFeeBps(10_000)).to.equal(100); // floor -> 1%
    expect(await perps.getFeeBps(100_000)).to.equal(200); // mega -> 2%
    expect(await perps.getFeeBps(1_000_000)).to.equal(500); // hyper -> 5%
  });

  it('rejects fee tiers above the 10% transparency cap', async () => {
    const { perps } = await loadFixture(deployFixture);
    await expect(
      perps.setFeeSchedule(50, 10_000, 100_000, 1_000_000, 1_001, 500, 100, 200, 500),
    ).to.be.revertedWithCustomError(perps, 'FeeTooHigh');
  });
});

describe('KasLevVault — developer seed lock', () => {
  it('accepts the seed once and locks it for 100 days', async () => {
    const { vault, developer } = await loadFixture(deployFixture);
    expect(await vault.developerPrincipal()).to.equal(SEED);
    expect(await vault.isUnlocked()).to.equal(false);
    // A second seed deposit (any amount) must revert — the seed can be set exactly once.
    await expect(
      vault.connect(developer).depositInitialLiquidity({ value: ethers.parseEther('1') }),
    ).to.be.revertedWithCustomError(vault, 'SeedAlreadyDeposited');
  });

  it('blocks principal withdrawal before the lock expires', async () => {
    const { vault, developer } = await loadFixture(deployFixture);
    await expect(vault.connect(developer).withdrawDeveloperPrincipal()).to.be.revertedWithCustomError(
      vault,
      'StillLocked',
    );
  });

  it('after 100 days lets the developer reclaim ONLY the original principal', async () => {
    const { vault, developer, devFee, trader, perps, oracle } = await loadFixture(deployFixture);

    // Generate protocol profit: a losing trader donates their margin to the pool.
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });
    // Price drops 20% -> long is liquidated, margin stays in the pool.
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.024'));
    await perps.connect(devFee).liquidate(1); // anyone can liquidate

    const poolBefore = await vault.totalLiquidity();
    expect(poolBefore).to.be.greaterThan(SEED); // pool grew from the loss

    await time.increase(LOCK + 1n);
    const balBefore = await ethers.provider.getBalance(developer.address);
    const tx = await vault.connect(developer).withdrawDeveloperPrincipal();
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(developer.address);

    // Developer receives EXACTLY the principal — not a wei of the accumulated profit.
    expect(balAfter - balBefore + gas).to.equal(SEED);
    // The extra profit remains permanently in the pool.
    expect(await vault.totalLiquidity()).to.equal(poolBefore - SEED);
    // Cannot withdraw a second time.
    await expect(vault.connect(developer).withdrawDeveloperPrincipal()).to.be.revertedWithCustomError(
      vault,
      'AlreadyWithdrawn',
    );
  });

  it('has no owner backdoor to drain liquidity', async () => {
    const { vault } = await loadFixture(deployFixture);
    // The vault exposes no owner-callable withdrawal function at all.
    expect(vault.sweep).to.equal(undefined);
    expect(vault.withdraw).to.equal(undefined);
    expect(vault.emergencyWithdraw).to.equal(undefined);
  });
});

describe('KasLevPerps — trading', () => {
  it('opens a LONG, charges the open fee to the dev wallet, and refunds excess', async () => {
    const { perps, vault, devFee, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { openFee, total } = await perps.quoteOpenCost(10, margin);
    expect(openFee).to.equal(ethers.parseEther('1')); // 1% of 100

    const devBefore = await ethers.provider.getBalance(devFee.address);
    const vaultBefore = await vault.totalLiquidity();

    // Overpay by 5 KAS; expect the surplus refunded.
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total + ethers.parseEther('5') });

    expect(await ethers.provider.getBalance(devFee.address)).to.equal(devBefore + openFee);
    expect(await vault.totalLiquidity()).to.equal(vaultBefore + margin);

    const pos = await perps.positions(1);
    expect(pos.trader).to.equal(trader.address);
    expect(pos.isLong).to.equal(true);
    expect(pos.margin).to.equal(margin);
  });

  it('settles a winning LONG: pays margin + profit minus the close fee', async () => {
    const { perps, oracle, devFee, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });

    // +10% price move at 10x -> +100% on margin -> +100 KAS profit.
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.033'));
    expect(await perps.currentPnL(1)).to.equal(ethers.parseEther('100'));

    const balBefore = await ethers.provider.getBalance(trader.address);
    const devBefore = await ethers.provider.getBalance(devFee.address);
    const tx = await perps.connect(trader).closePosition(1);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(trader.address);

    // equity 200, close fee 1 (1% of margin) -> payout 199.
    expect(balAfter - balBefore + gas).to.equal(ethers.parseEther('199'));
    expect(await ethers.provider.getBalance(devFee.address)).to.equal(devBefore + ethers.parseEther('1'));
  });

  it('settles a winning SHORT symmetrically', async () => {
    const { perps, oracle, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, false, margin, { value: total });
    // -10% price move benefits the short by +100 KAS.
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.027'));
    expect(await perps.currentPnL(1)).to.equal(ethers.parseEther('100'));
  });

  it('liquidates a LONG once the maintenance threshold is crossed', async () => {
    const { perps, oracle, keeper, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });

    expect(await perps.isLiquidatable(1)).to.equal(false);
    // liq price ~ 0.03*(1 - (0.1 - 0.001)) = 0.02703; move below it.
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.0269'));
    expect(await perps.isLiquidatable(1)).to.equal(true);

    await expect(perps.connect(keeper).liquidate(1)).to.emit(perps, 'PositionClosed');
    const pos = await perps.positions(1);
    expect(pos.closed).to.equal(true);
  });

  it('rejects liquidating a healthy position', async () => {
    const { perps, keeper, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });
    await expect(perps.connect(keeper).liquidate(1)).to.be.revertedWithCustomError(perps, 'NotLiquidatable');
  });

  it('allows Emergency Close even while opening is paused', async () => {
    const { perps, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });

    await perps.pause();
    // New positions are blocked...
    await expect(perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total })).to.be.reverted;
    // ...but the trader can always close (emergency close).
    await expect(perps.connect(trader).closePosition(1)).to.emit(perps, 'PositionClosed');
  });

  it('enforces per-market max leverage and stale-price protection', async () => {
    const { perps, oracle, trader, registry } = await loadFixture(deployFixture);
    await registry.setMaxLeverage(KAS_ID, 100);
    const margin = ethers.parseEther('100');
    const q101 = await perps.quoteOpenCost(101, margin);
    await expect(
      perps.connect(trader).openPosition(KAS_ID, 101, true, margin, { value: q101.total }),
    ).to.be.revertedWithCustomError(perps, 'InvalidLeverage');

    // Let all reporter prices go stale (> oracle maxAge); the median oracle then reports no
    // fresh price (0), so the engine refuses to open with ZeroPrice — trading pauses safely.
    await time.increase(301);
    const q = await perps.quoteOpenCost(10, margin);
    await expect(
      perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: q.total }),
    ).to.be.revertedWithCustomError(perps, 'ZeroPrice');

    // Refresh and it works again.
    await oracle.setPrice(KAS_ID, PRICE_003);
    await expect(perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: q.total })).to.emit(
      perps,
      'PositionOpened',
    );
  });

  it('charges the 5% high-risk fee above 50x leverage', async () => {
    const { perps } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { openFee } = await perps.quoteOpenCost(100, margin);
    expect(openFee).to.equal(ethers.parseEther('5')); // 5% of 100
  });

  it('charges a configurable keeper fee on open, routed to the keeper wallet', async () => {
    const { perps, owner, keeper, trader } = await loadFixture(deployFixture);
    const kFee = ethers.parseEther('0.1');
    await perps.connect(owner).setKeeperConfig(keeper.address, kFee);

    const margin = ethers.parseEther('100');
    const q = await perps.quoteOpenCost(10, margin);
    expect(q.keeperFee_).to.equal(kFee);
    expect(q.total).to.equal(margin + q.openFee + kFee); // margin + 1% + keeper fee

    const keeperBefore = await ethers.provider.getBalance(keeper.address);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: q.total });
    expect(await ethers.provider.getBalance(keeper.address)).to.equal(keeperBefore + kFee);
  });

  it('rejects a keeper fee above the MAX_KEEPER_FEE cap', async () => {
    const { perps, owner, keeper } = await loadFixture(deployFixture);
    await expect(
      perps.connect(owner).setKeeperConfig(keeper.address, ethers.parseEther('6')),
    ).to.be.revertedWithCustomError(perps, 'KeeperFeeTooHigh');
  });

  it('routes the 5% liquidation profit-share to the developer (guarded by the seed)', async () => {
    const { perps, oracle, vault, devFee, keeper, trader } = await loadFixture(deployFixture);
    expect(await perps.liqShareBps()).to.equal(500); // 5% default
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(20, margin);
    await perps.connect(trader).openPosition(KAS_ID, 20, true, margin, { value: total });

    const liq = await perps.liquidationPrice(1);
    await oracle.setPrice(KAS_ID, (liq * 999n) / 1000n); // just below liq

    // Pool (5000 seed + 100 margin) is far above the seed, so the full 5 KAS share pays out.
    await expect(perps.connect(keeper).liquidate(1))
      .to.emit(vault, 'LiquidationSharePaid')
      .withArgs(devFee.address, ethers.parseEther('5'), ethers.parseEther('5'));
  });

  it('caps the liquidation share at MAX_LIQ_SHARE_BPS and is adjustable', async () => {
    const { perps } = await loadFixture(deployFixture);
    await expect(perps.setLiqShareBps(2001)).to.be.revertedWithCustomError(perps, 'LiqShareTooHigh');
    await perps.setLiqShareBps(1000); // raise to 10% over time
    expect(await perps.liqShareBps()).to.equal(1000);
  });
});

describe('House solvency — payout caps & escrow protection', () => {
  it('caps a huge win at maxPayoutPoolBps of free liquidity (no trapped winners)', async () => {
    const { perps, oracle, trader } = await loadFixture(deployFixture);
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });

    // +1000% price move at 10x -> raw profit 10,000 KAS on a 5,100 KAS pool. Uncapped this
    // would drain (and previously brick) the vault. Cap = min(900% x 100, 2% x 5,100) = 102.
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.33'));

    const balBefore = await ethers.provider.getBalance(trader.address);
    const tx = await perps.connect(trader).closePosition(1);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(trader.address);

    // equity = 100 + 102 = 202, close fee 1 -> payout 201. Close succeeds, pool survives.
    expect(balAfter - balBefore + gas).to.equal(ethers.parseEther('201'));
  });

  it('caps profit at maxProfitBps of the position margin', async () => {
    const { perps, oracle, trader } = await loadFixture(deployFixture);
    await perps.setPayoutCaps(1000, 2000); // 10% of margin, 20% of pool
    const margin = ethers.parseEther('100');
    const { total } = await perps.quoteOpenCost(10, margin);
    await perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: total });
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.033')); // raw +100 profit

    const balBefore = await ethers.provider.getBalance(trader.address);
    const tx = await perps.connect(trader).closePosition(1);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    // profit capped at 10 -> equity 110, fee 1 -> payout 109
    expect((await ethers.provider.getBalance(trader.address)) - balBefore + gas).to.equal(ethers.parseEther('109'));
  });

  it('rejects invalid payout caps', async () => {
    const { perps } = await loadFixture(deployFixture);
    await expect(perps.setPayoutCaps(0, 200)).to.be.revertedWithCustomError(perps, 'BadPayoutCaps');
    await expect(perps.setPayoutCaps(90000, 2001)).to.be.revertedWithCustomError(perps, 'BadPayoutCaps');
  });

  it('developer principal withdrawal can NEVER touch open-position escrow', async () => {
    const { perps, oracle, vault, developer, trader, keeper } = await loadFixture(deployFixture);
    await perps.setPayoutCaps(90000, 2000); // allow a 20%-of-pool win to drain the pool a bit

    // Trader A opens and STAYS OPEN (their 100 KAS margin is escrow, not pool money).
    const marginA = ethers.parseEther('100');
    const qA = await perps.quoteOpenCost(10, marginA);
    await perps.connect(trader).openPosition(KAS_ID, 10, false, marginA, { value: qA.total }); // SHORT

    // Trader B wins big and cashes out, pulling the pool below the seed principal.
    const marginB = ethers.parseEther('500');
    const qB = await perps.quoteOpenCost(10, marginB);
    await perps.connect(keeper).openPosition(KAS_ID, 10, true, marginB, { value: qB.total }); // LONG
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.033')); // +10%
    await perps.connect(keeper).closePosition(2); // B: +500 profit (within caps), payout 999

    // Pool: 5000 + 100 + 500 - 1(feeB) - 999(payoutB) = 4600; escrow (A) = 100.
    expect(await vault.totalLiquidity()).to.equal(ethers.parseEther('4600'));
    expect(await vault.escrowedMargin()).to.equal(ethers.parseEther('100'));
    expect(await vault.freeLiquidity()).to.equal(ethers.parseEther('4500'));

    await time.increase(LOCK + 1n);
    const balBefore = await ethers.provider.getBalance(developer.address);
    const tx = await vault.connect(developer).withdrawDeveloperPrincipal();
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;

    // Developer gets only the FREE liquidity (4500), not A's escrowed 100.
    expect((await ethers.provider.getBalance(developer.address)) - balBefore + gas).to.equal(ethers.parseEther('4500'));
    expect(await vault.totalLiquidity()).to.equal(ethers.parseEther('100')); // exactly A's escrow

    // And trader A can still settle against their escrow afterwards (fresh price needed
    // after the 100-day time jump made the previous report stale).
    await oracle.setPrice(KAS_ID, ethers.parseEther('0.033'));
    await expect(perps.connect(trader).closePosition(1)).to.emit(perps, 'PositionClosed');
  });
});
