import { createRequire } from "node:module";
import { createServer } from "node:http";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { createApp } from "../src/app.js";
import { BlockchainService } from "../src/blockchain-service.js";
import { GHOST_PROTOCOL_ABI } from "../src/contract-abi.js";

const require = createRequire(import.meta.url);
const artifact = require("../../../contracts/artifacts/contracts/GhostProtocol.sol/GhostProtocol.json");

const RPC_URL = "http://127.0.0.1:8545";
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const USER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ORACLE_KEY = OWNER_KEY;
const CHECK_IN = 60 * 60;
const GRACE = 60 * 60;
const releaseKey = toUtf8Bytes("backend-local-release-key");
const keyCommitment = keccak256(releaseKey);
const payloadHash = keccak256(toUtf8Bytes("backend-local-encrypted-payload"));

const provider = new JsonRpcProvider(RPC_URL);
const owner = new Wallet(OWNER_KEY, provider);
const user = new Wallet(USER_KEY, provider);
const oracle = new Wallet(ORACLE_KEY, provider);
const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
const contract = await factory.deploy(owner.address, oracle.address);
await contract.waitForDeployment();
const contractAddress = await contract.getAddress();

const service = new BlockchainService(RPC_URL, contractAddress, ORACLE_KEY);
const app = createApp(service, "*");
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start API server");
const baseUrl = `http://127.0.0.1:${address.port}`;

const userContract = new Contract(contractAddress, GHOST_PROTOCOL_ABI, user);
const createVault = async (suffix: string) => {
  const tx = await userContract.createVault(
    payloadHash,
    `bafybackendlocal${suffix}`,
    keyCommitment,
    CHECK_IN,
    GRACE,
  );
  await tx.wait();
};

console.log(`1. Contract deployed at ${contractAddress}`);
console.log(`2. GET /health -> ${(await (await fetch(`${baseUrl}/health`)).json() as { status: string }).status}`);
await createVault("one");
console.log(`3. Created vault through a wallet; API vault count: ${((await (await fetch(`${baseUrl}/api/v1/vaults`)).json()) as { count: number }).count}`);

await provider.send("evm_increaseTime", [CHECK_IN + GRACE + 1]);
await provider.send("evm_mine", []);
const scanResponse = await fetch(`${baseUrl}/api/v1/oracle/scan`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ execute: true }),
});
const scanBody = await scanResponse.json() as { triggered?: Array<{ vaultId: string; hash: string }>; error?: string };
if (!scanResponse.ok || !scanBody.triggered) {
  throw new Error(`Expiration scan failed: ${scanBody.error ?? JSON.stringify(scanBody)}`);
}
console.log(`4. Expiration scan relayed ${scanBody.triggered.length} transaction(s)`);

await createVault("two");
const evidenceHash = keccak256(toUtf8Bytes("backend-local-verified-evidence"));
const oracleResponse = await fetch(`${baseUrl}/api/v1/oracle/vaults/2/trigger`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ evidenceHash }),
});
const oracleBody = await oracleResponse.json() as { hash?: string; error?: string };
if (!oracleResponse.ok || !oracleBody.hash) {
  throw new Error(`Oracle trigger failed: ${oracleBody.error ?? JSON.stringify(oracleBody)}`);
}
console.log(`5. Oracle trigger relayed: ${oracleBody.hash}`);

const vaultOne = await service.getVault(1);
const vaultTwo = await service.getVault(2);
console.log(`6. Vault 1 state: ${vaultOne.stateName}`);
console.log(`7. Vault 2 state: ${vaultTwo.stateName}`);
if (vaultOne.stateName !== "Triggered" || vaultTwo.stateName !== "Triggered") {
  throw new Error("Expected both local test vaults to be Triggered");
}
server.close();
console.log("Backend-to-contract local flow completed successfully.");
