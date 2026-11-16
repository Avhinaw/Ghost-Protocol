import cors from "cors";
import { keccak256, verifyMessage } from "ethers";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { AssessmentRegistry } from "./assessment-registry.js";
import type { AiVerifier } from "./ai-verifier.js";
import { BlockchainService, type VaultRecord } from "./blockchain-service.js";
import type { VaultStore } from "./mongo-vault-store.js";

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
const encryptedFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 + 16, files: 1 },
});

class BadRequestError extends Error {}

export function vaultFileSignatureMessage(
  action: "upload" | "download",
  chainId: string,
  contractAddress: string,
  vaultId: string,
  payloadHash: string,
  uploadMetadata?: { fileName: string; iv: string; contentType: string },
): string {
  const message = [
    "Ghost Protocol encrypted vault file",
    `action: ${action}`,
    `chainId: ${chainId}`,
    `contractAddress: ${contractAddress.toLowerCase()}`,
    `vaultId: ${vaultId}`,
    `payloadHash: ${payloadHash.toLowerCase()}`,
  ];
  if (action === "upload" && uploadMetadata) {
    message.push(
      `fileName: ${uploadMetadata.fileName}`,
      `iv: ${uploadMetadata.iv}`,
      `contentType: ${uploadMetadata.contentType}`,
    );
  }
  return message.join("\n");
}

function safeFileName(fileName: string): string {
  const normalized = fileName.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (normalized || "encrypted-payload").slice(0, 180);
}

function parseVaultId(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new BadRequestError("vaultId must be a positive uint256");
  }
  const vaultId = BigInt(value);
  if (vaultId === 0n || vaultId > (1n << 256n) - 1n) {
    throw new BadRequestError("vaultId must be a positive uint256");
  }
  return vaultId;
}

function getVaultIdParam(request: Request): bigint {
  const value = request.params.vaultId;
  if (typeof value !== "string") {
    throw new BadRequestError("vaultId must be a positive uint256");
  }
  return parseVaultId(value);
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
  vaultStore?: VaultStore,
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
        vaultStorageConfigured: Boolean(vaultStore),
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
        vaultStorageConfigured: Boolean(vaultStore),
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

  app.post("/api/v1/vaults/:vaultId/file", encryptedFileUpload.single("file"), async (request, response, next) => {
    try {
      if (!vaultStore) {
        response.status(503).json({ error: "Encrypted file storage is not configured" });
        return;
      }
      if (!request.file) {
        response.status(400).json({ error: "A single encrypted file is required" });
        return;
      }
      const vaultId = getVaultIdParam(request);
      const vault = await service.getVault(vaultId);
      const chainId = (await service.chainId()).toString();
      const payloadHash = keccak256(request.file.buffer);
      if (payloadHash.toLowerCase() !== vault.payloadHash.toLowerCase()) {
        response.status(409).json({ error: "Encrypted file hash does not match the on-chain payload hash" });
        return;
      }
      const expectedCid = `mongo://${payloadHash.slice(2).toLowerCase()}`;
      if (vault.payloadCid !== expectedCid) {
        response.status(409).json({ error: "Vault does not reference MongoDB-backed encrypted storage" });
        return;
      }
      const iv = request.body?.iv;
      const signature = request.body?.signature;
      const contentType = typeof request.body?.contentType === "string"
        ? request.body.contentType.slice(0, 160) || "application/octet-stream"
        : "application/octet-stream";
      if (typeof iv !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(iv) || Buffer.from(iv, "base64").length !== 12) {
        response.status(400).json({ error: "A valid 12-byte AES-GCM IV is required" });
        return;
      }
      if (typeof signature !== "string") {
        response.status(401).json({ error: "Wallet signature is required" });
        return;
      }
      const fileName = safeFileName(request.file.originalname);
      let signerAddress: string;
      try {
        signerAddress = verifyMessage(
          vaultFileSignatureMessage("upload", chainId, service.contractAddress, vaultId.toString(), payloadHash, {
            fileName: request.file.originalname,
            iv,
            contentType,
          }),
          signature,
        ).toLowerCase();
      } catch {
        response.status(401).json({ error: "Wallet signature is invalid" });
        return;
      }
      if (signerAddress !== vault.owner.toLowerCase()) {
        response.status(403).json({ error: "Only the on-chain vault owner can store its encrypted file" });
        return;
      }
      await vaultStore.saveVaultFile({
        chainId,
        contractAddress: service.contractAddress,
        vaultId: vaultId.toString(),
        ownerAddress: vault.owner,
        fileName,
        contentType,
        payloadHash,
        iv,
        encryptedData: request.file.buffer,
      });
      response.status(201).json({
        vaultId: vaultId.toString(),
        ownerAddress: vault.owner,
        fileName,
        payloadHash,
        stored: true,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/vaults/:vaultId/file", async (request, response, next) => {
    try {
      if (!vaultStore) {
        response.status(503).json({ error: "Encrypted file storage is not configured" });
        return;
      }
      const vaultId = getVaultIdParam(request);
      const chainId = (await service.chainId()).toString();
      const vault = await service.getVault(vaultId);
      const file = await vaultStore.getVaultFile(chainId, service.contractAddress, vaultId.toString());
      if (!file) {
        response.status(404).json({ error: "Encrypted file was not found" });
        return;
      }
      if (file.payloadHash.toLowerCase() !== vault.payloadHash.toLowerCase()) {
        response.status(409).json({ error: "Stored file no longer matches the on-chain payload hash" });
        return;
      }
      const signature = request.header("x-wallet-signature");
      if (!signature) {
        response.status(401).json({ error: "Wallet signature is required" });
        return;
      }
      let signerAddress: string;
      try {
        signerAddress = verifyMessage(
          vaultFileSignatureMessage("download", chainId, service.contractAddress, vaultId.toString(), file.payloadHash),
          signature,
        ).toLowerCase();
      } catch {
        response.status(401).json({ error: "Wallet signature is invalid" });
        return;
      }
      if (signerAddress !== file.ownerAddress.toLowerCase() || signerAddress !== vault.owner.toLowerCase()) {
        response.status(403).json({ error: "Only the on-chain vault owner can access its encrypted file" });
        return;
      }
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      response.setHeader("X-Encrypted-File-IV", file.iv);
      response.setHeader("X-Original-Content-Type", encodeURIComponent(file.contentType));
      response.send(file.encryptedData);
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
      if (body.evidenceHash) {
        response.status(403).json({
          error: "Emergency triggers require a stored assessment and explicit reviewer approval",
        });
        return;
      }
      const vaultId = parseVaultId(request.params.vaultId);
      const result = await service.triggerExpired(vaultId);
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
    const status = error instanceof z.ZodError || error instanceof BadRequestError
      ? 400
      : error instanceof multer.MulterError
        ? error.code === "LIMIT_FILE_SIZE" ? 413 : 400
        : 500;
    response.status(status).json({ error: message });
  });

  return app;
}
