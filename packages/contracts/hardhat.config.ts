import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
const validOraclePrivateKey =
  oraclePrivateKey && /^0x[0-9a-fA-F]{64}$/.test(oraclePrivateKey)
    ? oraclePrivateKey
    : undefined;
const baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
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
      accounts: validOraclePrivateKey ? [validOraclePrivateKey] : [],
    },
  },
  test: {
    mocha: {
      timeout: 20_000,
    },
  },
});
