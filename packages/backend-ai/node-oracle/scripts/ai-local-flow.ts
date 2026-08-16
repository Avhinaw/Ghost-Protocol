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
const app = createApp(
  service,
  "*",
  new HttpAiVerifierClient(AI_VERIFIER_URL),
  new AssessmentRegistry(),
  REVIEWER_TOKEN,
);
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start API server");
const baseUrl = `http://127.0.0.1:${address.port}`;

const userContract = new Contract(contractAddress, GHOST_PROTOCOL_ABI, user);
const createTx = await userContract.createVault(
  keccak256(toUtf8Bytes("synthetic-ai-flow-encrypted-payload")),
  "local://synthetic-ai-flow",
  keccak256(toUtf8Bytes("synthetic-ai-flow-release-key")),
  3600,
  3600,
);
await createTx.wait();

const syntheticDocument = `OFFICIAL DEATH CERTIFICATE\nSubject: Jordan Example\nCertificate Number: DC-2026-041\nIssued by the Registrar of Vital Records.\nThis document is synthetic and used only for local testing.`;
const assessmentResponse = await fetch(`${baseUrl}/api/v1/ai/verify-text`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ documentText: syntheticDocument, sourceName: "synthetic-certificate.txt", declaredDocumentType: "Death Certificate" }),
});
const assessmentBody = await assessmentResponse.json() as { assessment?: { assessment_hash: string; auto_release_allowed: boolean; decision: string }; error?: string };
if (!assessmentResponse.ok || !assessmentBody.assessment) {
  throw new Error(`AI assessment failed: ${assessmentBody.error ?? JSON.stringify(assessmentBody)}`);
}
if (assessmentBody.assessment.auto_release_allowed) throw new Error("AI assessment must never allow automatic release");
console.log(`1. AI assessment stored: ${assessmentBody.assessment.assessment_hash}`);
console.log(`2. Decision: ${assessmentBody.assessment.decision}; human review remains required`);

const denied = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/ai-reviewed-trigger`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ assessmentHash: assessmentBody.assessment.assessment_hash, reviewerId: "local-reviewer", reviewerApproval: true, reviewerToken: "invalid-reviewer-token" }),
});
if (denied.status !== 403) throw new Error(`Expected denial without a valid review token, received ${denied.status}`);
console.log("3. Unapproved AI trigger blocked as expected");

const approved = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/ai-reviewed-trigger`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ assessmentHash: assessmentBody.assessment.assessment_hash, reviewerId: "local-reviewer", reviewerApproval: true, reviewerToken: REVIEWER_TOKEN }),
});
const approvedBody = await approved.json() as { hash?: string; error?: string };
if (!approved.ok || !approvedBody.hash) throw new Error(`Reviewed oracle trigger failed: ${approvedBody.error ?? JSON.stringify(approvedBody)}`);
console.log(`4. Reviewed oracle trigger relayed: ${approvedBody.hash}`);

const vault = await service.getVault(1);
if (vault.stateName !== "Triggered") throw new Error(`Expected Triggered, received ${vault.stateName}`);
console.log("5. Vault state: Triggered");
server.close();
console.log("AI-assisted review flow completed successfully.");
