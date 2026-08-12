import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
const baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const basescanApiKey = process.env.BASESCAN_API_KEY || "";

export default defineConfig({
  plugins: [hardhatEthers, hardhatMocha],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
    localhost: {
      type: "http",
      chainId: 31337,
      url: "http://127.0.0.1:8545",
      ethers: {
        waitForTransactionReceipt: true,
      },
    },
    baseSepolia: {
      type: "http",
      chainId: 84532,
      url: baseSepoliaRpcUrl,
      accounts: oraclePrivateKey ? [oraclePrivateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: basescanApiKey,
    },
  },
  test: {
    mocha: {
      timeout: 20_000,
    },
  },
});
