import { createRequire } from "node:module";
import { createServer } from "node:http";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { createApp } from "../src/app.js";
import { AssessmentRegistry } from "../src/assessment-registry.js";
import { HttpAiVerifierClient } from "../src/ai-verifier.js";
import { BlockchainService } from "../src/blockchain-service.js";
import { GHOST_PROTOCOL_ABI } from "../src/contract-abi.js";

const require = createRequire(import.meta.url);
const artifact = require("../../../contracts/artifacts/contracts/GhostProtocol.sol/GhostProtocol.json");
const RPC_URL = "http://127.0.0.1:8545";
const AI_VERIFIER_URL = process.env.AI_VERIFIER_URL ?? "http://127.0.0.1:8000";
const REVIEWER_TOKEN = process.env.REVIEWER_APPROVAL_TOKEN ?? "local-review-token-123456";
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const USER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const provider = new JsonRpcProvider(RPC_URL);
const owner = new Wallet(OWNER_KEY, provider);
const user = new Wallet(USER_KEY, provider);
const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
const contract = await factory.deploy(owner.address, owner.address);
await contract.waitForDeployment();
const contractAddress = await contract.getAddress();
const service = new BlockchainService(RPC_URL, contractAddress, OWNER_KEY);
const app = createApp(service, "*", new HttpAiVerifierClient(AI_VERIFIER_URL), new AssessmentRegistry(), REVIEWER_TOKEN);
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start local API server");
const baseUrl = `http://127.0.0.1:${address.port}`;

const releaseKey = toUtf8Bytes("synthetic-complete-flow-release-key");
const userContract = new Contract(contractAddress, GHOST_PROTOCOL_ABI, user);
const createTx = await userContract.createVault(
  keccak256(toUtf8Bytes("synthetic-encrypted-upload")),
  "local://synthetic-complete-flow-document",
  keccak256(releaseKey),
  3600,
  3600,
);
await createTx.wait();
console.log(`1. Vault created: ${contractAddress}`);

const syntheticDocument = `OFFICIAL DEATH CERTIFICATE\nSubject: Jordan Example\nCertificate Number: DC-2026-041\nIssued by the Registrar of Vital Records.\nThis document is synthetic and used only for local testing.`;
const form = new FormData();
form.append("file", new Blob([syntheticDocument], { type: "text/plain" }), "synthetic-death-certificate.txt");
const uploadResponse = await fetch(`${baseUrl}/api/v1/ai/verify-document`, { method: "POST", body: form });
const uploadBody = await uploadResponse.json() as { assessment?: { assessment_hash: string; decision: string; auto_release_allowed: boolean }; error?: string };
if (!uploadResponse.ok || !uploadBody.assessment) throw new Error(`Document upload assessment failed: ${uploadBody.error ?? JSON.stringify(uploadBody)}`);
if (uploadBody.assessment.auto_release_allowed) throw new Error("AI must not permit automatic release");
console.log(`2. Document uploaded and AI assessed: ${uploadBody.assessment.decision}`);

const blocked = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/ai-reviewed-trigger`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ assessmentHash: uploadBody.assessment.assessment_hash, reviewerId: "manual-reviewer", reviewerApproval: true, reviewerToken: "invalid-reviewer-token" }),
});
if (blocked.status !== 403) throw new Error(`Expected manual review gate to block, received ${blocked.status}`);
console.log("3. Manual review gate blocked the unapproved trigger");

const reviewResponse = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/ai-reviewed-trigger`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ assessmentHash: uploadBody.assessment.assessment_hash, reviewerId: "manual-reviewer", reviewerApproval: true, reviewerToken: REVIEWER_TOKEN }),
});
const reviewBody = await reviewResponse.json() as { hash?: string; error?: string };
if (!reviewResponse.ok || !reviewBody.hash) throw new Error(`Manual review trigger failed: ${reviewBody.error ?? JSON.stringify(reviewBody)}`);
console.log(`4. Manual reviewer approved; oracle trigger relayed: ${reviewBody.hash}`);

const ownerContract = new Contract(contractAddress, artifact.abi, owner);
const releaseTx = await ownerContract.releaseVault(1, releaseKey);
await releaseTx.wait();
const finalVault = await service.getVault(1);
if (finalVault.stateName !== "Released" || !finalVault.releaseKeyAvailable) {
  throw new Error(`Expected final Released state, received ${finalVault.stateName}`);
}
console.log(`5. Manual release key accepted; final vault state: ${finalVault.stateName}`);
server.close();
console.log("Complete synthetic document-to-release flow completed successfully.");
