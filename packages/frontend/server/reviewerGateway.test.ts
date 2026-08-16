import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { approveAssessmentLocally, loadLocalReviewerConfig } from "./reviewerGateway";

describe("local reviewer gateway", () => {
  it("keeps the local reviewer token on the server while approving an assessment", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.reviewerToken).toBe("server-only-local-token");
      expect(body.reviewerApproval).toBe(true);
      return new Response(JSON.stringify({ hash: "0x123" }), { status: 202 });
    });
    const config = loadLocalReviewerConfig({ NODE_ORACLE_URL: "http://127.0.0.1:4000", REVIEWER_APPROVAL_TOKEN: "server-only-local-token" });
    const result = await approveAssessmentLocally({ vaultId: "1", assessmentHash: "0x" + "ab".repeat(32), reviewerId: "reviewer-1" }, config, fetchMock as typeof fetch);
    expect(result).toEqual({ hash: "0x123" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("records a protected local rejection without an oracle request", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "local-reviewer",
        name: "Local Reviewer",
        email: "reviewer@example.test",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as any,
      res: {} as any,
    });
    const result = await caller.reviewer.reject({ assessmentHash: "0x" + "cd".repeat(32), reason: "Synthetic evidence rejected during local test." });
    expect(result.oracleCalled).toBe(false);
    expect(result.reviewerId).toBe("local-reviewer");
  });
});
