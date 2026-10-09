import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createApp } from "../src/app.js";

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
