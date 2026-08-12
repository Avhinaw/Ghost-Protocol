import { network } from "hardhat";

const { ethers } = await network.create();

const STATE_NAMES = ["Active", "Triggered", "Released", "Cancelled"];
const CHECK_IN = 60 * 60;
const GRACE = 60 * 60;
const releaseKey = ethers.toUtf8Bytes("local-demo-release-key");
const payloadHash = ethers.keccak256(ethers.toUtf8Bytes("local-encrypted-payload"));
const keyCommitment = ethers.keccak256(releaseKey);

const [deployer, user, oracle] = await ethers.getSigners();
const factory = await ethers.getContractFactory("GhostProtocol", deployer);
const contract = await factory.deploy(deployer.address, oracle.address);
await contract.waitForDeployment();

console.log(`1. Deployed: ${await contract.getAddress()}`);
console.log(`2. User: ${user.address}`);
console.log(`3. Oracle: ${oracle.address}`);

const createTx = await contract
  .connect(user)
  .createVault(payloadHash, "bafybeighostprotocol-local-demo", keyCommitment, CHECK_IN, GRACE);
await createTx.wait();

const vaultId = 1n;
let vault = await contract.getVault(vaultId);
console.log(`4. Created vault ${vaultId}: ${STATE_NAMES[Number(vault.state)]}`);
console.log(`   Deadline: ${await contract.heartbeatDeadline(vaultId)}`);

await (await contract.connect(user).sendHeartbeat(vaultId)).wait();
console.log("5. Heartbeat accepted");

await ethers.provider.send("evm_increaseTime", [CHECK_IN + GRACE + 1]);
await ethers.provider.send("evm_mine", []);
console.log(`6. Time advanced; expired: ${await contract.isExpired(vaultId)}`);

await (await contract.connect(oracle).checkAndTriggerExpired(vaultId)).wait();
vault = await contract.getVault(vaultId);
console.log(`7. Timeout trigger: ${STATE_NAMES[Number(vault.state)]}`);

await (await contract.connect(oracle).releaseVault(vaultId, releaseKey)).wait();
vault = await contract.getVault(vaultId);
console.log(`8. Key commitment verified; final state: ${STATE_NAMES[Number(vault.state)]}`);
console.log(`9. Released key: ${ethers.toUtf8String(vault.releaseKey)}`);
console.log("Local Ghost Protocol flow completed successfully.");
