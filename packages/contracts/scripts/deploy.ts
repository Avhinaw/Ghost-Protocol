import { network } from "hardhat";

const { ethers } = await network.create();

function configuredAddress(value: string | undefined, fallback: string): string {
  if (!value || value === ethers.ZeroAddress) return fallback;
  return value;
}

const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error(
    "No deployment signer is configured. Set ORACLE_PRIVATE_KEY in the repository-root .env file; for Base Sepolia, use a funded testnet wallet."
  );
}
const oracleAddress = configuredAddress(process.env.ORACLE_ADMIN_ADDRESS, deployer.address);

console.log(`Deploying GhostProtocol from: ${deployer.address}`);
console.log(`Authorized oracle: ${oracleAddress}`);

const contract = await ethers.deployContract("GhostProtocol", [deployer.address, oracleAddress]);
await contract.waitForDeployment();

const contractAddress = await contract.getAddress();
console.log(`GhostProtocol deployed at: ${contractAddress}`);
console.log(`Network chain ID: ${(await ethers.provider.getNetwork()).chainId}`);
console.log("Set VITE_CONTRACT_ADDRESS to this address if a frontend fallback is needed.");
