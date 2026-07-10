require('@nomicfoundation/hardhat-toolbox');

/**
 * KasLev contracts target the Kaspa EVM Layer-2 execution environment (e.g. Kasplex,
 * Igra, Sparkle) available around the Kaspa Toccata upgrade. The native gas/collateral
 * asset on these L2s is KAS (18 decimals), which is why the protocol uses native value
 * (payable) for all liquidity and margin rather than a wrapped ERC-20.
 *
 * RPC endpoints are intentionally env-var placeholders — nothing about the deployment is
 * hidden; the community can point this config at any public Kaspa L2 RPC to compile, test
 * and deploy an identical protocol.
 *
 * NOTE: JavaScript config (not TypeScript) is used deliberately so the toolchain runs
 * cleanly on the installed Node runtime without relying on ts-node.
 */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true, // IR pipeline: better optimization + avoids "stack too deep"
      evmVersion: 'paris', // widely compatible target for emerging L2s
    },
  },
  networks: {
    hardhat: {},
    kaspaL2Testnet: {
      url: process.env.KASPA_L2_RPC_URL || '',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
