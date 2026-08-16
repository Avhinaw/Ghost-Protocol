import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { approveAssessmentLocally, getLocalOracleConfig, loadLocalReviewerConfig, verifyDocumentLocally } from "./reviewerGateway";

const LOCAL_RUNTIME_MESSAGE = "The hosted preview cannot reach the sandbox-local oracle or AI verifier. Run this flow in the development preview while the local services are running.";

function requireLocalReviewerRuntime() {
  if (ENV.isProduction) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: LOCAL_RUNTIME_MESSAGE });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    localReviewerSignIn: publicProcedure.mutation(async ({ ctx }) => {
      if (ENV.isProduction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Local reviewer mode is unavailable in production." });
      }

      const openId = ENV.ownerOpenId || "ghost-local-reviewer";
      const name = "Local Test Reviewer";
      await db.upsertUser({ openId, name, loginMethod: "local-test", role: "admin", lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { localOnly: true as const, name };
    }),
  }),
  reviewer: router({
    status: protectedProcedure.query(async () => {
      if (ENV.isProduction) {
        return { localOnly: true as const, available: false as const, reason: LOCAL_RUNTIME_MESSAGE, chainId: null, contractAddress: null, rpcConfigured: false };
      }
      const config = loadLocalReviewerConfig();
      return { localOnly: true as const, available: true as const, reason: null, ...(await getLocalOracleConfig(config)) };
    }),
    assessDocument: protectedProcedure.input(z.object({ fileName: z.string().min(1).max(180), mimeType: z.string().min(1).max(120), base64: z.string().min(4).max(11_200_000) })).mutation(async ({ input }) => {
      requireLocalReviewerRuntime();
      const config = loadLocalReviewerConfig();
      return verifyDocumentLocally(input, config);
    }),
    approve: protectedProcedure.input(z.object({ vaultId: z.string().regex(/^\d+$/), assessmentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) })).mutation(async ({ ctx, input }) => {
      requireLocalReviewerRuntime();
      const config = loadLocalReviewerConfig();
      return approveAssessmentLocally({ ...input, reviewerId: ctx.user.openId }, config);
    }),
    reject: protectedProcedure.input(z.object({ assessmentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), reason: z.string().min(3).max(400) })).mutation(({ ctx, input }) => ({
      localOnly: true as const,
      assessmentHash: input.assessmentHash,
      reviewerId: ctx.user.openId,
      reason: input.reason,
      rejectedAt: new Date().toISOString(),
      oracleCalled: false as const,
    })),
  }),
});

export type AppRouter = typeof appRouter;
