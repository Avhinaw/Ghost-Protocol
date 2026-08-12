import { network } from "hardhat";

const { ethers } = await network.create();

function configuredAddress(value: string | undefined, fallback: string): string {
  if (!value || value === ethers.ZeroAddress) return fallback;
  return value;
}

const [deployer] = await ethers.getSigners();
const oracleAddress = configuredAddress(process.env.ORACLE_ADMIN_ADDRESS, deployer.address);

console.log(`Deploying GhostProtocol from: ${deployer.address}`);
console.log(`Authorized oracle: ${oracleAddress}`);

const factory = await ethers.getContractFactory("GhostProtocol", deployer);
const contract = await factory.deploy(deployer.address, oracleAddress);
await contract.waitForDeployment();

const contractAddress = await contract.getAddress();
console.log(`GhostProtocol deployed at: ${contractAddress}`);
console.log(`Network chain ID: ${(await ethers.provider.getNetwork()).chainId}`);
console.log("Set NEXT_PUBLIC_CONTRACT_ADDRESS to this address for the frontend.");
