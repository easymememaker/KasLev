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

    // Let the price go stale (> maxPriceAge) and confirm opens are rejected.
    await time.increase(301);
    const q = await perps.quoteOpenCost(10, margin);
    await expect(
      perps.connect(trader).openPosition(KAS_ID, 10, true, margin, { value: q.total }),
    ).to.be.revertedWithCustomError(perps, 'StalePrice');

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
});
