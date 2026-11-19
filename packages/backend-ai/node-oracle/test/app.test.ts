import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { keccak256, Wallet } from "ethers";
import test from "node:test";
import { createApp, stagedUploadSignatureMessage, vaultFileSignatureMessage } from "../src/app.js";
import type { StageVaultFileInput } from "../src/mongo-vault-store.js";
import type { VaultFileModel } from "../src/models.js";
import { computeEncryptedPayloadHash, computeProofHash } from "../src/vault-proof.js";

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
  documentReleased: false,
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

test("backend returns a clear 503 when CONTRACT_ADDRESS has no contract bytecode", async (t) => {
  const fakeService = {
    contractAddress: "0x0000000000000000000000000000000000000002",
    provider: {
      getBlockNumber: async () => 123n,
      getCode: async () => "0x",
    },
    chainId: async () => 84532n,
    oracleAddress: async () => null,
    isConfiguredOracle: async () => null,
    listVaults: async () => {
      throw new Error("listVaults must not be called without contract bytecode");
    },
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any));
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/v1/vaults`);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.contractCodePresent, false);
  assert.equal(body.chainId, "84532");
  assert.match(body.error, /No GhostProtocol contract is deployed/);
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

test("staged file proof must match its on-chain vault before signed release and download", async (t) => {
  const owner = Wallet.createRandom();
  const uploadId = randomUUID();
  const encryptedData = Buffer.from("synthetic encrypted binary payload");
  const ivBytes = Buffer.alloc(12, 7);
  const iv = ivBytes.toString("base64");
  const encryptedMetadata = Buffer.from("synthetic encrypted file metadata");
  const metadataIv = Buffer.alloc(12, 6).toString("base64");
  const wrappedKey = Buffer.concat([Buffer.from("GPK1"), Buffer.alloc(76, 9)]);
  const plaintextSha256 = `0x${createHash("sha256").update(Buffer.from("synthetic binary original")).digest("hex")}`;
  const encryptedPayloadSha256 = computeEncryptedPayloadHash(iv, encryptedData);
  const encryptedMetadataSha256 = computeEncryptedPayloadHash(metadataIv, encryptedMetadata);
  const keyCommitment = keccak256(wrappedKey);
  const proofManifest = {
    plaintextSha256,
    encryptedPayloadSha256,
    encryptedMetadataSha256,
    iv,
    metadataIv,
    keyCommitment,
  };
  const proofHash = computeProofHash(proofManifest);
  const contractAddress = "0x0000000000000000000000000000000000000002";
  const transactionHash = `0x${"ab".repeat(32)}`;
  const otherOwner = Wallet.createRandom();
  let vault = {
    ...sampleVault,
    owner: owner.address,
    payloadHash: proofHash,
    payloadCid: `mongo://${uploadId}`,
    keyCommitment,
    state: 1,
    stateName: "Triggered",
    documentReleased: false,
  };
  let savedFile: VaultFileModel | undefined;
  const fakeStore = {
    stageVaultFile: async (file: StageVaultFileInput) => { savedFile = { ...file, createdAt: new Date(), updatedAt: new Date() }; },
    anchorVaultFile: async (input: { uploadId: string; vaultId: string; anchorTxHash: string; anchorBlockNumber: number }) => {
      if (!savedFile || savedFile.uploadId !== input.uploadId || savedFile.status !== "PENDING_ANCHOR") return false;
      savedFile = { ...savedFile, ...input, status: "ANCHORED", updatedAt: new Date(), expiresAt: undefined };
      return true;
    },
    getVaultFileByUploadId: async () => savedFile ?? null,
    getVaultFile: async () => savedFile?.status === "ANCHORED" ? savedFile : null,
  };
  let createdEvent = {
    name: "VaultCreated",
    args: { vaultId: 1n, owner: otherOwner.address, payloadHash: proofHash },
  };
  const fakeService = {
    contractAddress,
    chainId: async () => 84532n,
    getVault: async () => vault,
    contract: { interface: { parseLog: () => createdEvent } },
    provider: {
      getTransactionReceipt: async () => ({
        status: 1,
        to: contractAddress,
        hash: transactionHash,
        blockNumber: 123,
        logs: [{ address: contractAddress }],
      }),
    },
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any, undefined, undefined, undefined, undefined, fakeStore));
  t.after(() => server.close());

  const signature = await owner.signMessage(stagedUploadSignatureMessage(
    "84532", contractAddress, uploadId, proofHash, keyCommitment,
  ));
  const form = new FormData();
  form.append("file", new Blob([encryptedData]), "encrypted-payload.bin");
  form.append("uploadId", uploadId);
  form.append("plaintextSha256", plaintextSha256);
  form.append("encryptedPayloadSha256", encryptedPayloadSha256);
  form.append("encryptedMetadataSha256", encryptedMetadataSha256);
  form.append("proofHash", proofHash);
  form.append("keyCommitment", keyCommitment);
  form.append("iv", iv);
  form.append("metadataIv", metadataIv);
  form.append("encryptedMetadata", encryptedMetadata.toString("base64"));
  form.append("wrappedKey", wrappedKey.toString("base64"));
  form.append("signature", signature);
  const upload = await fetch(`${baseUrl}/api/v1/uploads`, { method: "POST", body: form });
  assert.equal(upload.status, 201);
  assert.equal(savedFile?.ownerAddress, owner.address.toLowerCase());
  assert.deepEqual(savedFile?.encryptedData, encryptedData);
  assert.deepEqual(savedFile?.encryptedMetadata, encryptedMetadata);
  assert.equal("fileName" in savedFile!, false);
  assert.equal("contentType" in savedFile!, false);

  const badDigestForm = new FormData();
  badDigestForm.append("file", new Blob([Buffer.from("tampered encrypted payload")]), "wrong.bin");
  badDigestForm.append("uploadId", randomUUID());
  badDigestForm.append("plaintextSha256", plaintextSha256);
  badDigestForm.append("encryptedPayloadSha256", encryptedPayloadSha256);
  badDigestForm.append("encryptedMetadataSha256", encryptedMetadataSha256);
  badDigestForm.append("proofHash", proofHash);
  badDigestForm.append("keyCommitment", keyCommitment);
  badDigestForm.append("iv", iv);
  badDigestForm.append("metadataIv", metadataIv);
  badDigestForm.append("encryptedMetadata", encryptedMetadata.toString("base64"));
  badDigestForm.append("wrappedKey", wrappedKey.toString("base64"));
  badDigestForm.append("signature", signature);
  const mismatchedUpload = await fetch(`${baseUrl}/api/v1/uploads`, { method: "POST", body: badDigestForm });
  assert.equal(mismatchedUpload.status, 409);

  const invalidWrappedKeyForm = new FormData();
  invalidWrappedKeyForm.append("file", new Blob([encryptedData]), "invalid-key.bin");
  invalidWrappedKeyForm.append("uploadId", randomUUID());
  invalidWrappedKeyForm.append("plaintextSha256", plaintextSha256);
  invalidWrappedKeyForm.append("encryptedPayloadSha256", encryptedPayloadSha256);
  invalidWrappedKeyForm.append("encryptedMetadataSha256", encryptedMetadataSha256);
  invalidWrappedKeyForm.append("proofHash", proofHash);
  invalidWrappedKeyForm.append("keyCommitment", keyCommitment);
  invalidWrappedKeyForm.append("iv", iv);
  invalidWrappedKeyForm.append("metadataIv", metadataIv);
  invalidWrappedKeyForm.append("encryptedMetadata", encryptedMetadata.toString("base64"));
  invalidWrappedKeyForm.append("wrappedKey", Buffer.concat([Buffer.from("BAD1"), Buffer.alloc(76, 9)]).toString("base64"));
  invalidWrappedKeyForm.append("signature", signature);
  const invalidWrappedKey = await fetch(`${baseUrl}/api/v1/uploads`, {
    method: "POST",
    body: invalidWrappedKeyForm,
  });
  assert.equal(invalidWrappedKey.status, 400);

  const anchor = await fetch(`${baseUrl}/api/v1/uploads/${uploadId}/anchor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultId: "1", transactionHash }),
  });
  assert.equal(anchor.status, 409);
  assert.equal(savedFile?.status, "PENDING_ANCHOR");
  createdEvent = {
    name: "VaultCreated",
    args: { vaultId: 1n, owner: owner.address, payloadHash: `0x${"ff".repeat(32)}` },
  };
  const mismatchedEvent = await fetch(`${baseUrl}/api/v1/uploads/${uploadId}/anchor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultId: "1", transactionHash }),
  });
  assert.equal(mismatchedEvent.status, 409);
  createdEvent = {
    name: "VaultCreated",
    args: { vaultId: 1n, owner: owner.address, payloadHash: proofHash },
  };
  const validAnchor = await fetch(`${baseUrl}/api/v1/uploads/${uploadId}/anchor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultId: "1", transactionHash }),
  });
  assert.equal(validAnchor.status, 200);
  assert.equal(savedFile?.status, "ANCHORED");

  const verifySignature = await owner.signMessage(vaultFileSignatureMessage("verify", "84532", contractAddress, "1", proofHash));
  const anchoredRecord = savedFile;
  savedFile = { ...savedFile!, encryptedData: Buffer.from("tampered encrypted payload") };
  const corruptedProof = await fetch(`${baseUrl}/api/v1/vaults/1/proof`, { headers: { "x-wallet-signature": verifySignature } });
  assert.equal(corruptedProof.status, 409);
  savedFile = { ...anchoredRecord!, encryptedMetadata: Buffer.from("tampered encrypted metadata") };
  const corruptedMetadata = await fetch(`${baseUrl}/api/v1/vaults/1/proof`, {
    headers: { "x-wallet-signature": verifySignature },
  });
  assert.equal(corruptedMetadata.status, 409);
  savedFile = anchoredRecord;
  const proof = await fetch(`${baseUrl}/api/v1/vaults/1/proof`, { headers: { "x-wallet-signature": verifySignature } });
  assert.equal(proof.status, 200);
  const proofBody = await proof.json();
  assert.equal(proofBody.verified, true);
  assert.equal("fileName" in proofBody, false);

  const otherWallet = Wallet.createRandom();
  const unauthorizedProof = await fetch(`${baseUrl}/api/v1/vaults/1/proof`, {
    headers: {
      "x-wallet-signature": await otherWallet.signMessage(
        vaultFileSignatureMessage("verify", "84532", contractAddress, "1", proofHash),
      ),
    },
  });
  assert.equal(unauthorizedProof.status, 403);

  const downloadSignature = await owner.signMessage(vaultFileSignatureMessage("download", "84532", contractAddress, "1", proofHash));
  const blockedDownload = await fetch(`${baseUrl}/api/v1/vaults/1/file`, {
    headers: { "x-wallet-signature": downloadSignature },
  });
  assert.equal(blockedDownload.status, 403);

  vault = { ...vault, state: 2, stateName: "Released", documentReleased: true };
  const download = await fetch(`${baseUrl}/api/v1/vaults/1/file`, {
    headers: { "x-wallet-signature": downloadSignature },
  });
  assert.equal(download.status, 200);
  const downloadedFile = await download.json();
  assert.equal(downloadedFile.proofHash, proofHash);
  assert.deepEqual(Buffer.from(downloadedFile.encryptedData, "base64"), encryptedData);
  assert.deepEqual(Buffer.from(downloadedFile.encryptedMetadata, "base64"), encryptedMetadata);
  assert.equal("fileName" in downloadedFile, false);
  assert.equal("contentType" in downloadedFile, false);
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
