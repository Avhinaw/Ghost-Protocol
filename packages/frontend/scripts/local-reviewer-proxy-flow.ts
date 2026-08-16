import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { appRouter } from "../server/routers";

const RPC_URL = "http://127.0.0.1:8545";
const USER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ABI = [
  "function createVault(bytes32 payloadHash, string payloadCid, bytes32 keyCommitment, uint64 checkInInterval, uint64 gracePeriod) returns (uint256 vaultId)",
  "function releaseVault(uint256 vaultId, bytes releaseKey)",
  "function vaultCount() view returns (uint256)",
] as const;

const ctx = {
  user: {
    id: 1,
    openId: "local-reviewer",
    name: "Local Reviewer",
    email: "local-reviewer@example.test",
    loginMethod: "test",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as any,
  res: {} as any,
};

const caller = appRouter.createCaller(ctx);
const protocol = await caller.reviewer.status();
const provider = new JsonRpcProvider(RPC_URL);
const user = new Wallet(USER_KEY, provider);
const releaseKey = toUtf8Bytes("review-ui-local-release-key");

const vaultContract = new Contract(protocol.contractAddress, ABI, user);
const createTx = await vaultContract.createVault(
  keccak256(toUtf8Bytes("review-ui-local-ciphertext")),
  "local://review-ui-synthetic-document",
  keccak256(releaseKey),
  3600,
  3600,
);
await createTx.wait();
const vaultId = (await vaultContract.vaultCount()).toString();

const syntheticText = "OFFICIAL DEATH CERTIFICATE\nSubject: Jordan Example\nCertificate Number: DC-2026-041\nIssued by the Registrar of Vital Records. This document is synthetic and used only for local reviewer UI testing.";
const assessmentResponse = await caller.reviewer.assessDocument({
  fileName: "synthetic-reviewer-certificate.txt",
  mimeType: "text/plain",
  base64: Buffer.from(syntheticText).toString("base64"),
});
const assessment = assessmentResponse.assessment as { assessment_hash: string; decision: string; auto_release_allowed: boolean };
if (assessment.auto_release_allowed || assessment.decision !== "HUMAN_REVIEW_REQUIRED") throw new Error("Expected a human-reviewed mock assessment");
console.log(`1. tRPC document upload and AI assessment: ${assessment.decision}`);

const approval = await caller.reviewer.approve({ vaultId, assessmentHash: assessment.assessment_hash });
if (!(approval as { hash?: string }).hash) throw new Error("Expected an oracle transaction hash");
console.log("2. Protected tRPC reviewer approval relayed to the local oracle");

await (await vaultContract.releaseVault(vaultId, releaseKey)).wait();
const finalVaultResponse = await fetch(`http://127.0.0.1:4000/api/v1/vaults/${vaultId}`);
const finalVault = await finalVaultResponse.json() as { vault?: { stateName?: string } };
if (finalVault.vault?.stateName !== "Released") throw new Error(`Expected Released, received ${finalVault.vault?.stateName}`);
console.log("3. Manual release key accepted; vault is Released");
console.log("Reviewer Console protected local API flow completed successfully.");
