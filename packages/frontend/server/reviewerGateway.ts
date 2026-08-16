type FetchLike = typeof fetch;

export type LocalReviewerConfig = {
  oracleUrl: string;
  reviewerToken: string;
};

export type DocumentInput = {
  fileName: string;
  mimeType: string;
  base64: string;
};

function ensureLocalOracle(oracleUrl: string) {
  const hostname = new URL(oracleUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error("This Reviewer Console build is restricted to a local Node oracle while testing.");
  }
}

export function loadLocalReviewerConfig(env: NodeJS.ProcessEnv = process.env): LocalReviewerConfig {
  const config = {
    oracleUrl: (env.NODE_ORACLE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, ""),
    reviewerToken: env.REVIEWER_APPROVAL_TOKEN ?? "local-review-token-123456",
  };
  ensureLocalOracle(config.oracleUrl);
  return config;
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? body.detail ?? `Oracle request failed (${response.status})`);
  return body;
}

export async function getLocalOracleConfig(config: LocalReviewerConfig, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(`${config.oracleUrl}/api/v1/config`);
  return parseResponse(response) as Promise<{ chainId: string; contractAddress: string; rpcConfigured: boolean }>;
}

export async function verifyDocumentLocally(input: DocumentInput, config: LocalReviewerConfig, fetchImpl: FetchLike = fetch) {
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Document must be between 1 byte and 8MB.");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: input.mimeType || "application/octet-stream" }), input.fileName);
  const response = await fetchImpl(`${config.oracleUrl}/api/v1/ai/verify-document`, { method: "POST", body: form });
  return parseResponse(response);
}

export async function approveAssessmentLocally(
  input: { vaultId: string; assessmentHash: string; reviewerId: string },
  config: LocalReviewerConfig,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`${config.oracleUrl}/api/v1/oracle/vaults/${input.vaultId}/ai-reviewed-trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assessmentHash: input.assessmentHash,
      reviewerId: input.reviewerId,
      reviewerApproval: true,
      reviewerToken: config.reviewerToken,
    }),
  });
  return parseResponse(response);
}
