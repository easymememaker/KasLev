const { ethers } = require('hardhat');

/**
 * KasLev deployment script.
 *
 * Every deployment parameter below is a plain, visible value — there is no hidden setup.
 * Override any of them with environment variables at deploy time:
 *
 *   DEV_FEE_WALLET   address that receives developer trading fees (defaults to deployer)
 *   DEVELOPER_WALLET address that funds & may reclaim the seed principal (defaults to deployer)
 *   SEED_KAS         initial locked liquidity in whole KAS (spec: 30000). You hold 40000 KAS,
 *                    so a typical choice is to lock 30000 and keep the rest for gas.
 *   LOCK_DAYS        seed lock duration in days (spec: 100)
 *   DEPOSIT_SEED     "true" to also deposit the seed now (needs SEED_KAS balance on developer)
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  const devFeeWallet = process.env.DEV_FEE_WALLET || deployer.address;
  const developer = process.env.DEVELOPER_WALLET || deployer.address;
  const seedKas = BigInt(process.env.SEED_KAS || '30000');
  const lockDays = BigInt(process.env.LOCK_DAYS || '100');
  const lockDuration = lockDays * 24n * 60n * 60n;

  console.log('Deploying KasLev protocol with:');
  console.log('  owner (deployer): ', deployer.address);
  console.log('  developer wallet: ', developer);
  console.log('  dev fee wallet:   ', devFeeWallet);
  console.log('  seed liquidity:   ', seedKas.toString(), 'KAS');
  console.log('  lock duration:    ', lockDays.toString(), 'days');

  // 1. Oracle
  const oracle = await (await ethers.getContractFactory('KasLevOracle')).deploy(deployer.address);
  await oracle.waitForDeployment();
  console.log('KasLevOracle:        ', await oracle.getAddress());

  // 2. Asset registry
  const registry = await (await ethers.getContractFactory('KasLevAssetRegistry')).deploy(deployer.address);
  await registry.waitForDeployment();
  console.log('KasLevAssetRegistry: ', await registry.getAddress());

  // 3. Vault (holds liquidity, enforces the developer seed lock)
  const vault = await (await ethers.getContractFactory('KasLevVault')).deploy(deployer.address, developer, lockDuration);
  await vault.waitForDeployment();
  console.log('KasLevVault:         ', await vault.getAddress());

  // 4. Perps engine
  const perps = await (await ethers.getContractFactory('KasLevPerps')).deploy(
    deployer.address,
    await vault.getAddress(),
    await registry.getAddress(),
    await oracle.getAddress(),
    devFeeWallet,
  );
  await perps.waitForDeployment();
  console.log('KasLevPerps:         ', await perps.getAddress());

  // 5. Wire the vault to the engine (one-time, immutable thereafter)
  await (await vault.setPerps(await perps.getAddress())).wait();
  console.log('Vault -> Perps wired.');

  // 6. List the flagship KAS/USDT market so the protocol is usable immediately.
  await (await registry.listAsset('KAS', 1_000_000)).wait();
  console.log('Listed market: KAS (max leverage 1,000,000x)');

  // 7. Optionally deposit the developer seed now.
  if ((process.env.DEPOSIT_SEED || '').toLowerCase() === 'true') {
    await (await vault.depositInitialLiquidity({ value: ethers.parseEther(seedKas.toString()) })).wait();
    console.log(`Deposited ${seedKas} KAS seed; unlocks in ${lockDays} days.`);
  } else {
    console.log('Seed NOT deposited (set DEPOSIT_SEED=true to deposit at deploy time).');
  }

  console.log('\nDeployment complete.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
