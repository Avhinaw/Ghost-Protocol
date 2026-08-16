import { network } from "hardhat";

const { ethers } = await network.create("localhost");
const contractAddress = process.env.CONTRACT_ADDRESS;
if (!contractAddress) throw new Error("CONTRACT_ADDRESS is required");

const [, user] = await ethers.getSigners();
const contract = await ethers.getContractAt("GhostProtocol", contractAddress, user);
const key = ethers.toUtf8Bytes("frontend-local-demo-key");
const payloadHash = ethers.keccak256(ethers.toUtf8Bytes("frontend-local-demo-payload"));
const keyCommitment = ethers.keccak256(key);
const tx = await contract.createVault(payloadHash, "local://frontend-demo/evidence.txt", keyCommitment, 604800, 172800);
await tx.wait();
console.log(`Seeded vault; transaction ${tx.hash}`);
