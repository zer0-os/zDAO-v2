import type { HardhatUserConfig } from "hardhat/config";
import { configVariable } from "hardhat/config";
import typechain from "@nomicfoundation/hardhat-typechain"
import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";


const config: HardhatUserConfig = {
  plugins: [
    hardhatToolboxViem,
    hardhatViem,
    hardhatMocha,
    typechain
  ],
  solidity: {
    compilers: [
      {
        version: "0.8.30",
        settings: {
          optimizer: {
            enabled: true,
            runs: 20000,
          },
        },
      },
    ],
    npmFilesToBuild: [
      "@safe-global/safe-contracts/contracts/SafeL2.sol",
      "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol",
      "@safe-global/safe-contracts/contracts/libraries/MultiSend.sol",
      "@safe-global/safe-contracts/contracts/libraries/MultiSendCallOnly.sol",
      "@safe-global/safe-contracts/contracts/libraries/SignMessageLib.sol",
      "@safe-global/safe-contracts/contracts/libraries/CreateCall.sol",
      "@safe-global/safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol",
    ],
  },
  typechain: {
    outDir: "typechain",
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
};

export default config;
