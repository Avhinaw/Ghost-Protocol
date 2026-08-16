import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { AssessmentRegistry } from "./assessment-registry.js";
import type { AiVerifier } from "./ai-verifier.js";
import { BlockchainService, type VaultRecord } from "./blockchain-service.js";

const triggerBodySchema = z.object({
  evidenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

const executeBodySchema = z.object({
  execute: z.boolean().default(false),
});

const verifyTextBodySchema = z.object({
  documentText: z.string().min(20).max(20_000),
  sourceName: z.string().min(1).max(180),
  declaredDocumentType: z.string().min(1).max(80).optional(),
});

const reviewedTriggerBodySchema = z.object({
  assessmentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  reviewerId: z.string().min(3).max(120),
  reviewerApproval: z.literal(true),
  reviewerToken: z.string().min(16),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

function parseVaultId(value: string): bigint {
  if (!/^\d+$/.test(value) || value === "0") {
    throw new Error("vaultId must be a positive integer");
  }
  return BigInt(value);
}

function serializeVault(vault: VaultRecord) {
  return {
    id: vault.id.toString(),
    owner: vault.owner,
    payloadHash: vault.payloadHash,
    payloadCid: vault.payloadCid,
    keyCommitment: vault.keyCommitment,
    checkInInterval: vault.checkInInterval.toString(),
    gracePeriod: vault.gracePeriod.toString(),
    createdAt: vault.createdAt.toString(),
    lastHeartbeat: vault.lastHeartbeat.toString(),
    triggeredAt: vault.triggeredAt.toString(),
    triggerEvidenceHash: vault.triggerEvidenceHash,
    state: vault.state,
    stateName: vault.stateName,
    releaseKeyAvailable: vault.releaseKeyAvailable,
    deadline: vault.deadline.toString(),
    expired: vault.expired,
  };
}

export function createApp(
  service: BlockchainService,
  corsOrigin = "http://localhost:3000",
  aiVerifier?: AiVerifier,
  assessmentRegistry = new AssessmentRegistry(),
  reviewerApprovalToken?: string,
) {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", async (_request, response, next) => {
    try {
      response.json({
        status: "ok",
        service: "ghost-protocol-node-oracle",
        chainId: (await service.chainId()).toString(),
        contractAddress: service.contractAddress,
        oracleAddress: await service.oracleAddress(),
        oracleConfigured: await service.isConfiguredOracle(),
        aiVerifierConfigured: Boolean(aiVerifier),
        aiAssistedAutoRelease: false,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/config", async (_request, response, next) => {
    try {
      response.json({
        chainId: (await service.chainId()).toString(),
        contractAddress: service.contractAddress,
        rpcConfigured: true,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/vaults", async (_request, response, next) => {
    try {
      const vaults = await service.listVaults();
      response.json({ vaults: vaults.map(serializeVault), count: vaults.length });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/vaults/:vaultId", async (request, response, next) => {
    try {
      const vault = await service.getVault(parseVaultId(request.params.vaultId));
      response.json({ vault: serializeVault(vault) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/ai/verify-text", async (request, response, next) => {
    try {
      if (!aiVerifier) {
        response.status(503).json({ error: "AI verifier is not configured" });
        return;
      }
      const body = verifyTextBodySchema.parse(request.body ?? {});
      const assessment = assessmentRegistry.store(await aiVerifier.verifyText(body));
      response.status(202).json({
        assessment,
        reviewRequired: true,
        message: "Assessment stored. An authorized human reviewer must approve it before any oracle trigger.",
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/ai/verify-document", upload.single("file"), async (request, response, next) => {
    try {
      if (!aiVerifier) {
        response.status(503).json({ error: "AI verifier is not configured" });
        return;
      }
      if (!request.file) {
        response.status(400).json({ error: "A single document file is required" });
        return;
      }
      const assessment = assessmentRegistry.store(await aiVerifier.verifyDocument({
        bytes: request.file.buffer,
        fileName: request.file.originalname,
        contentType: request.file.mimetype || "application/octet-stream",
      }));
      response.status(202).json({
        assessment,
        reviewRequired: true,
        message: "Document assessment stored. An authorized human reviewer must approve it before any oracle trigger.",
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/oracle/vaults/:vaultId/ai-reviewed-trigger", async (request, response, next) => {
    try {
      const body = reviewedTriggerBodySchema.parse(request.body ?? {});
      if (!reviewerApprovalToken || body.reviewerToken !== reviewerApprovalToken) {
        response.status(403).json({ error: "Valid reviewer approval is required for an AI-assisted trigger" });
        return;
      }
      const assessment = assessmentRegistry.get(body.assessmentHash);
      if (!assessment) {
        response.status(404).json({ error: "Assessment was not found or has expired" });
        return;
      }
      if (
        assessment.decision !== "HUMAN_REVIEW_REQUIRED" ||
        assessment.auto_release_allowed !== false ||
        assessment.requires_human_review !== true
      ) {
        response.status(409).json({ error: "Assessment is not eligible for a reviewed oracle trigger" });
        return;
      }
      const vaultId = parseVaultId(request.params.vaultId);
      const result = await service.triggerViaOracle(vaultId, assessment.assessment_hash);
      response.status(202).json({
        vaultId: vaultId.toString(),
        assessmentHash: assessment.assessment_hash,
        reviewerId: body.reviewerId,
        approvedAt: new Date().toISOString(),
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/oracle/scan", async (request, response, next) => {
    try {
      const { execute } = executeBodySchema.parse(request.body ?? {});
      const expiredVaults = await service.scanExpiredVaults();
      const results = [];

      if (execute) {
        for (const vault of expiredVaults) {
          results.push({ vaultId: vault.id.toString(), ...(await service.triggerExpired(vault.id)) });
        }
      }

      response.json({
        execute,
        expiredVaults: expiredVaults.map(serializeVault),
        triggered: results,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/oracle/vaults/:vaultId/trigger", async (request, response, next) => {
    try {
      const body = triggerBodySchema.parse(request.body ?? {});
      const vaultId = parseVaultId(request.params.vaultId);
      const result = body.evidenceHash
        ? await service.triggerViaOracle(vaultId, body.evidenceHash)
        : await service.triggerExpired(vaultId);
      response.status(202).json({ vaultId: vaultId.toString(), ...result });
    } catch (error) {
      next(error);
    }
  });

  app.use((_request: Request, response: Response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error instanceof z.ZodError ? 400 : 500;
    response.status(status).json({ error: message });
  });

  return app;
}
