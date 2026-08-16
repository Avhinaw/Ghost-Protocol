import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/env", () => ({ ENV: { isProduction: true, ownerOpenId: "", appId: "", cookieSecret: "", databaseUrl: "", oAuthServerUrl: "", forgeApiUrl: "", forgeApiKey: "" } }));

import { appRouter } from "./routers";

describe("Reviewer Console hosted boundary", () => {
  it("reports the sandbox-local gateway as unavailable and blocks assessment without a 500-style network failure", async () => {
    const ctx: TrpcContext = {
      user: { id: 1, openId: "portfolio-reviewer", name: "Portfolio Reviewer", email: null, loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const reviewer = appRouter.createCaller(ctx).reviewer;

    await expect(reviewer.status()).resolves.toMatchObject({ available: false, rpcConfigured: false });
    await expect(reviewer.assessDocument({ fileName: "synthetic.txt", mimeType: "text/plain", base64: "c3ludGhldGlj" })).rejects.toThrow("hosted preview cannot reach the sandbox-local oracle");
  });
});
