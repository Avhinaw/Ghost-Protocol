import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createSessionToken: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: mocks.createSessionToken } }));

import { appRouter } from "./routers";

describe("auth.localReviewerSignIn", () => {
  it("creates a development-only reviewer session using the regular signed cookie", async () => {
    mocks.createSessionToken.mockResolvedValue("signed-local-reviewer-session");
    const cookie = vi.fn();
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { cookie } as TrpcContext["res"],
    };

    const result = await appRouter.createCaller(ctx).auth.localReviewerSignIn();

    expect(result).toEqual({ localOnly: true, name: "Local Test Reviewer" });
    expect(mocks.createSessionToken).toHaveBeenCalledWith("ghost-local-reviewer", expect.objectContaining({ name: "Local Test Reviewer" }));
    expect(cookie).toHaveBeenCalledWith(expect.any(String), "signed-local-reviewer-session", expect.objectContaining({ httpOnly: true, secure: true, sameSite: "none", path: "/" }));
  });
});
