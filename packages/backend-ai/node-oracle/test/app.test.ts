import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { keccak256, Wallet } from "ethers";
import test from "node:test";
import { createApp, vaultFileSignatureMessage } from "../src/app.js";
import type { SaveVaultFileInput } from "../src/mongo-vault-store.js";
import type { VaultFileModel } from "../src/models.js";

const sampleVault = {
  id: 1n,
  owner: "0x0000000000000000000000000000000000000001",
  payloadHash: "0x" + "11".repeat(32),
  payloadCid: "bafytest",
  keyCommitment: "0x" + "22".repeat(32),
  checkInInterval: 3600n,
  gracePeriod: 3600n,
  createdAt: 100n,
  lastHeartbeat: 100n,
  triggeredAt: 0n,
  triggerEvidenceHash: "0x" + "00".repeat(32),
  state: 0,
  stateName: "Active",
  releaseKeyAvailable: false,
  deadline: 7300n,
  expired: false,
};

async function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not determine test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("backend API returns frontend-ready config and vault JSON", async (t) => {
  const fakeService = {
    contractAddress: "0x0000000000000000000000000000000000000002",
    chainId: async () => 31337n,
    oracleAddress: async () => null,
    isConfiguredOracle: async () => null,
    listVaults: async () => [sampleVault],
    getVault: async () => sampleVault,
    scanExpiredVaults: async () => [],
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any));
  t.after(() => server.close());

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).chainId, "31337");

  const vaults = await fetch(`${baseUrl}/api/v1/vaults`);
  const body = await vaults.json();
  assert.equal(vaults.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.vaults[0].id, "1");
  assert.equal(body.vaults[0].deadline, "7300");
});

test("backend rejects malformed oracle input", async (t) => {
  const fakeService = {
    contractAddress: "0x0000000000000000000000000000000000000002",
    chainId: async () => 31337n,
    oracleAddress: async () => null,
    isConfiguredOracle: async () => null,
    listVaults: async () => [],
    getVault: async () => sampleVault,
    scanExpiredVaults: async () => [],
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any));
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ evidenceHash: "not-a-bytes32" }),
  });
  assert.equal(response.status, 400);
});

test("encrypted vault files require the on-chain owner signature and matching payload hash", async (t) => {
  const owner = Wallet.createRandom();
  const encryptedData = Buffer.from("encrypted test payload");
  const payloadHash = keccak256(encryptedData);
  const vault = {
    ...sampleVault,
    owner: owner.address,
    payloadHash,
    payloadCid: `mongo://${payloadHash.slice(2).toLowerCase()}`,
  };
  let savedFile: VaultFileModel | undefined;
  const fakeStore = {
    saveVaultFile: async (file: SaveVaultFileInput) => { savedFile = { ...file, createdAt: new Date(), updatedAt: new Date() }; },
    getVaultFile: async () => savedFile ?? null,
  };
  const fakeService = {
    contractAddress: "0x0000000000000000000000000000000000000002",
    chainId: async () => 84532n,
    getVault: async () => vault,
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any, undefined, undefined, undefined, undefined, fakeStore));
  t.after(() => server.close());

  const iv = Buffer.alloc(12, 7).toString("base64");
  const mismatchedForm = new FormData();
  mismatchedForm.append("file", new Blob([Buffer.from("not the committed payload")]), "wrong.txt");
  const mismatchedUpload = await fetch(`${baseUrl}/api/v1/vaults/1/file`, { method: "POST", body: mismatchedForm });
  assert.equal(mismatchedUpload.status, 409);

  const uploadMessage = vaultFileSignatureMessage("upload", "84532", fakeService.contractAddress, "1", payloadHash, {
    fileName: "evidence.txt",
    iv,
    contentType: "text/plain",
  });
  const form = new FormData();
  form.append("file", new Blob([encryptedData]), "evidence.txt");
  form.append("iv", iv);
  form.append("contentType", "text/plain");
  form.append("signature", await owner.signMessage(uploadMessage));
  const upload = await fetch(`${baseUrl}/api/v1/vaults/1/file`, { method: "POST", body: form });
  assert.equal(upload.status, 201);
  assert.equal(savedFile?.ownerAddress, owner.address);
  assert.deepEqual(savedFile?.encryptedData, encryptedData);

  const downloadMessage = vaultFileSignatureMessage("download", "84532", fakeService.contractAddress, "1", payloadHash);
  const download = await fetch(`${baseUrl}/api/v1/vaults/1/file`, {
    headers: { "x-wallet-signature": await owner.signMessage(downloadMessage) },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("x-encrypted-file-iv"), iv);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), encryptedData);

  const otherWallet = Wallet.createRandom();
  const unauthorizedForm = new FormData();
  unauthorizedForm.append("file", new Blob([encryptedData]), "evidence.txt");
  unauthorizedForm.append("iv", iv);
  unauthorizedForm.append("contentType", "text/plain");
  unauthorizedForm.append("signature", await otherWallet.signMessage(uploadMessage));
  const unauthorized = await fetch(`${baseUrl}/api/v1/vaults/1/file`, { method: "POST", body: unauthorizedForm });
  assert.equal(unauthorized.status, 403);
});

test("backend reports invalid vault IDs and oversized uploads as client errors", async (t) => {
  let emergencyTriggerCalls = 0;
  const fakeService = {
    contractAddress: "0x0000000000000000000000000000000000000002",
    chainId: async () => 31337n,
    oracleAddress: async () => null,
    isConfiguredOracle: async () => null,
    listVaults: async () => [],
    getVault: async () => sampleVault,
    scanExpiredVaults: async () => [],
    triggerViaOracle: async () => { emergencyTriggerCalls += 1; return { txHash: "0x" + "12".repeat(32) }; },
    triggerExpired: async () => ({ txHash: "0x" + "34".repeat(32) }),
  };
  const fakeVerifier = {
    verifyText: async () => { throw new Error("unused"); },
    verifyDocument: async () => { throw new Error("oversized file must not reach verifier"); },
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any, undefined, fakeVerifier as any));
  t.after(() => server.close());

  for (const vaultId of ["not-an-id", "0", "000", (1n << 256n).toString()]) {
    const invalidVaultId = await fetch(`${baseUrl}/api/v1/vaults/${vaultId}`);
    assert.equal(invalidVaultId.status, 400);
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(8 * 1024 * 1024 + 1)]), "large.txt");
  const upload = await fetch(`${baseUrl}/api/v1/ai/verify-document`, { method: "POST", body: form });
  assert.equal(upload.status, 413);

  const unreviewedEmergencyTrigger = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ evidenceHash: "0x" + "ab".repeat(32) }),
  });
  assert.equal(unreviewedEmergencyTrigger.status, 403);
  assert.equal(emergencyTriggerCalls, 0);
});
