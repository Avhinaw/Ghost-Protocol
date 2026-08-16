import { createServer, type Server } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { AssessmentRegistry } from "../src/assessment-registry.js";

const assessmentHash = "0x" + "ab".repeat(32);

async function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not determine test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("AI assessment requires an explicit reviewer approval before the oracle is called", async (t) => {
  let triggerCalls = 0;
  const fakeService = {
    contractAddress: "0x0000000000000000000000000000000000000002",
    chainId: async () => 31337n,
    oracleAddress: async () => null,
    isConfiguredOracle: async () => null,
    listVaults: async () => [],
    getVault: async () => { throw new Error("unused"); },
    scanExpiredVaults: async () => [],
    triggerViaOracle: async () => { triggerCalls += 1; return { txHash: "0x" + "12".repeat(32) }; },
  };
  const fakeVerifier = {
    verifyText: async () => ({
      assessment_hash: assessmentHash,
      source_digest: "cd".repeat(32),
      mode: "mock" as const,
      model: "deterministic-local-fallback",
      decision: "HUMAN_REVIEW_REQUIRED" as const,
      auto_release_allowed: false as const,
      requires_human_review: true as const,
      is_valid_document: true,
      document_type: "Death Certificate",
      subject_name: "Synthetic Example",
      registration_hash: "DC-LOCAL-1",
      confidence_score: 0.91,
      summary: "Synthetic result.",
      reasons: ["Synthetic marker"],
      risk_flags: ["LOCAL_MOCK_MODE"],
    }),
    verifyDocument: async () => ({
      assessment_hash: assessmentHash,
      source_digest: "cd".repeat(32),
      mode: "mock" as const,
      model: "deterministic-local-fallback",
      decision: "HUMAN_REVIEW_REQUIRED" as const,
      auto_release_allowed: false as const,
      requires_human_review: true as const,
      is_valid_document: true,
      document_type: "Death Certificate",
      subject_name: "Synthetic Example",
      registration_hash: "DC-LOCAL-1",
      confidence_score: 0.91,
      summary: "Synthetic result.",
      reasons: ["Synthetic marker"],
      risk_flags: ["LOCAL_MOCK_MODE"],
    }),
  };
  const { server, baseUrl } = await listen(createApp(fakeService as any, undefined, fakeVerifier, new AssessmentRegistry(), "review-token-123456"));
  t.after(() => server.close());

  const assessmentResponse = await fetch(`${baseUrl}/api/v1/ai/verify-text`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentText: "Official synthetic evidence document for local testing only.", sourceName: "synthetic.txt" }),
  });
  assert.equal(assessmentResponse.status, 202);
  assert.equal((await assessmentResponse.json()).assessment.auto_release_allowed, false);

  const denied = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/ai-reviewed-trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assessmentHash, reviewerId: "reviewer-a", reviewerApproval: true, reviewerToken: "wrong-token-0000" }),
  });
  assert.equal(denied.status, 403);
  assert.equal(triggerCalls, 0);

  const approved = await fetch(`${baseUrl}/api/v1/oracle/vaults/1/ai-reviewed-trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assessmentHash, reviewerId: "reviewer-a", reviewerApproval: true, reviewerToken: "review-token-123456" }),
  });
  assert.equal(approved.status, 202);
  assert.equal((await approved.json()).assessmentHash, assessmentHash);
  assert.equal(triggerCalls, 1);
});
