import cors from "cors";
import { randomUUID } from "node:crypto";
import { keccak256, verifyMessage } from "ethers";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { AssessmentRegistry } from "./assessment-registry.js";
import type { AiVerifier } from "./ai-verifier.js";
import { BlockchainService, type VaultRecord } from "./blockchain-service.js";
import type { VaultStore } from "./mongo-vault-store.js";
import type { VaultFileModel } from "./models.js";
import { computeEncryptedPayloadHash, computeProofHash } from "./vault-proof.js";

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
const stageUploadBodySchema = z.object({
  uploadId: z.string().uuid(),
  plaintextSha256: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  encryptedPayloadSha256: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  encryptedMetadataSha256: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  proofHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  keyCommitment: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  iv: z.string(),
  metadataIv: z.string(),
  encryptedMetadata: z.string(),
  wrappedKey: z.string(),
  signature: z.string().min(1),
});
const anchorUploadBodySchema = z.object({
  vaultId: z.string().regex(/^[1-9]\d*$/),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const stagedFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 + 16, files: 1 },
});

class BadRequestError extends Error {}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: "code" in error ? (error as Error & { code?: unknown }).code : undefined,
      shortMessage: "shortMessage" in error
        ? (error as Error & { shortMessage?: unknown }).shortMessage
        : undefined,
    };
  }
  return { message: String(error) };
}

export function stagedUploadSignatureMessage(
  chainId: string,
  contractAddress: string,
  uploadId: string,
  payloadHash: string,
  keyCommitment: string,
): string {
  return [
    "Ghost Protocol staged encrypted file",
    `chainId: ${chainId}`,
    `contractAddress: ${contractAddress.toLowerCase()}`,
    `uploadId: ${uploadId}`,
    `proofHash: ${payloadHash.toLowerCase()}`,
    `keyCommitment: ${keyCommitment.toLowerCase()}`,
  ].join("\n");
}

export function vaultFileSignatureMessage(
  action: "verify" | "download",
  chainId: string,
  contractAddress: string,
  vaultId: string,
  proofHash: string,
): string {
  return [
    "Ghost Protocol vault file access",
    `action: ${action}`,
    `chainId: ${chainId}`,
    `contractAddress: ${contractAddress.toLowerCase()}`,
    `vaultId: ${vaultId}`,
    `proofHash: ${proofHash.toLowerCase()}`,
  ].join("\n");
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

function validBase64(value: string, minimumBytes: number, maximumBytes: number): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.length >= minimumBytes && bytes.length <= maximumBytes && bytes.toString("base64") === value
    ? bytes
    : null;
}

function verifyStoredProof(file: VaultFileModel, vault: VaultRecord): string | null {
  if (file.status !== "ANCHORED" || file.vaultId !== vault.id.toString()) {
    return "Stored upload has not been anchored to this vault";
  }
  if (
    file.ownerAddress.toLowerCase() !== vault.owner.toLowerCase() ||
    file.proofHash.toLowerCase() !== vault.payloadHash.toLowerCase() ||
    file.keyCommitment.toLowerCase() !== vault.keyCommitment.toLowerCase() ||
    vault.payloadCid !== `mongo://${file.uploadId}`
  ) {
    return "Stored proof metadata does not match the on-chain vault";
  }
  if (keccak256(file.wrappedKey).toLowerCase() !== file.keyCommitment.toLowerCase()) {
    return "Wrapped key does not match its committed hash";
  }
  if (computeEncryptedPayloadHash(file.iv, file.encryptedData).toLowerCase() !== file.encryptedPayloadSha256.toLowerCase()) {
    return "Stored encrypted bytes do not match their SHA-256 digest";
  }
  if (
    computeEncryptedPayloadHash(file.metadataIv, file.encryptedMetadata).toLowerCase() !==
    file.encryptedMetadataSha256.toLowerCase()
  ) {
    return "Stored encrypted file metadata does not match its SHA-256 digest";
  }
  if (computeProofHash(file).toLowerCase() !== file.proofHash.toLowerCase()) {
    return "Stored proof manifest does not match its SHA-256 digest";
  }
  return null;
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
    documentReleased: vault.documentReleased,
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
  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader("x-request-id", requestId);
    console.log("[request:start]", JSON.stringify({
      requestId,
      method: request.method,
      path: request.originalUrl,
    }));
    response.on("finish", () => {
      console.log("[request:finish]", JSON.stringify({
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    });
    next();
  });

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
      let contractCodePresent: boolean | null = null;
      if (service.provider) {
        contractCodePresent = (
          await (typeof (service as any).getCode === "function"
            ? (service as any).getCode(service.contractAddress)
            : service.provider.getCode(service.contractAddress))
        ) !== "0x";
      }
      response.json({
        chainId: (await service.chainId()).toString(),
        contractAddress: service.contractAddress,
        rpcConfigured: true,
        contractCodePresent,
        vaultStorageConfigured: Boolean(vaultStore),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/vaults", async (_request, response, next) => {
    try {
      if (service.provider) {
        const [chainId, blockNumber, contractCode] = await Promise.all([
          service.chainId(),
          typeof (service as any).getBlockNumber === "function"
            ? (service as any).getBlockNumber()
            : service.provider.getBlockNumber(),
          typeof (service as any).getCode === "function"
            ? (service as any).getCode(service.contractAddress)
            : service.provider.getCode(service.contractAddress),
        ]);
        const diagnostics = {
          chainId: chainId.toString(),
          blockNumber: blockNumber.toString(),
          contractAddress: service.contractAddress,
          contractCodePresent: contractCode !== "0x",
          contractCodeBytes: contractCode === "0x" ? 0 : (contractCode.length - 2) / 2,
        };
        console.log("[vaults:diagnostics]", JSON.stringify(diagnostics));
        if (!diagnostics.contractCodePresent) {
          response.status(503).json({
            error: "No GhostProtocol contract is deployed at CONTRACT_ADDRESS on this RPC network",
            chainId: diagnostics.chainId,
            contractAddress: diagnostics.contractAddress,
            contractCodePresent: false,
            requestId: response.getHeader("x-request-id"),
          });
          return;
        }
      }
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

  app.post("/api/v1/uploads", stagedFileUpload.single("file"), async (request, response, next) => {
    try {
      if (!vaultStore) {
        response.status(503).json({ error: "Encrypted file storage is not configured" });
        return;
      }
      if (!request.file) {
        response.status(400).json({ error: "A single encrypted file is required" });
        return;
      }
      const body = stageUploadBodySchema.parse(request.body ?? {});
      const ivBytes = validBase64(body.iv, 12, 12);
      const metadataIvBytes = validBase64(body.metadataIv, 12, 12);
      const encryptedMetadata = validBase64(body.encryptedMetadata, 16, 4096);
      const wrappedKey = validBase64(body.wrappedKey, 80, 80);
      if (!ivBytes || !metadataIvBytes || !encryptedMetadata || !wrappedKey || wrappedKey.toString("ascii", 0, 4) !== "GPK1") {
        response.status(400).json({ error: "AES-GCM IVs, encrypted metadata, or Argon2id-wrapped key package are invalid" });
        return;
      }
      if (request.file.buffer.length < 16) {
        response.status(400).json({ error: "Encrypted AES-GCM payload is missing its authentication tag" });
        return;
      }
      const encryptedPayloadSha256 = computeEncryptedPayloadHash(body.iv, request.file.buffer);
      if (encryptedPayloadSha256.toLowerCase() !== body.encryptedPayloadSha256.toLowerCase()) {
        response.status(409).json({ error: "Encrypted upload does not match its SHA-256 digest" });
        return;
      }
      const encryptedMetadataSha256 = computeEncryptedPayloadHash(body.metadataIv, encryptedMetadata);
      if (encryptedMetadataSha256.toLowerCase() !== body.encryptedMetadataSha256.toLowerCase()) {
        response.status(409).json({ error: "Encrypted file metadata does not match its SHA-256 digest" });
        return;
      }
      if (keccak256(wrappedKey).toLowerCase() !== body.keyCommitment.toLowerCase()) {
        response.status(409).json({ error: "Recipient key package does not match its key commitment" });
        return;
      }
      const manifest = {
        plaintextSha256: body.plaintextSha256,
        encryptedPayloadSha256,
        encryptedMetadataSha256,
        iv: body.iv,
        metadataIv: body.metadataIv,
        keyCommitment: body.keyCommitment,
      };
      const proofHash = computeProofHash(manifest);
      if (proofHash.toLowerCase() !== body.proofHash.toLowerCase()) {
        response.status(409).json({ error: "Proof manifest does not match its SHA-256 digest" });
        return;
      }
      const chainId = (await service.chainId()).toString();
      let ownerAddress: string;
      try {
        ownerAddress = verifyMessage(
          stagedUploadSignatureMessage(
            chainId,
            service.contractAddress,
            body.uploadId,
            proofHash,
            body.keyCommitment,
          ),
          body.signature,
        ).toLowerCase();
      } catch {
        response.status(401).json({ error: "Wallet signature is invalid" });
        return;
      }
      await vaultStore.stageVaultFile({
        uploadId: body.uploadId,
        chainId,
        contractAddress: service.contractAddress,
        ownerAddress,
        plaintextSha256: body.plaintextSha256.toLowerCase(),
        encryptedPayloadSha256,
        encryptedMetadataSha256,
        proofHash,
        keyCommitment: body.keyCommitment.toLowerCase(),
        iv: body.iv,
        metadataIv: body.metadataIv,
        encryptedData: request.file.buffer,
        encryptedMetadata,
        wrappedKey,
        status: "PENDING_ANCHOR",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      response.status(201).json({
        uploadId: body.uploadId,
        ownerAddress,
        proofHash,
        status: "PENDING_ANCHOR",
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/uploads/:uploadId/anchor", async (request, response, next) => {
    try {
      if (!vaultStore) {
        response.status(503).json({ error: "Encrypted file storage is not configured" });
        return;
      }
      const uploadId = request.params.uploadId;
      if (typeof uploadId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
        response.status(400).json({ error: "uploadId must be a UUID" });
        return;
      }
      const body = anchorUploadBodySchema.parse(request.body ?? {});
      const stagedFile = await vaultStore.getVaultFileByUploadId(uploadId);
      if (!stagedFile) {
        response.status(404).json({ error: "Staged upload was not found or has expired" });
        return;
      }
      const vaultId = parseVaultId(body.vaultId);
      const vault = await service.getVault(vaultId);
      const chainId = (await service.chainId()).toString();
      if (
        stagedFile.chainId !== chainId ||
        stagedFile.status !== "PENDING_ANCHOR" ||
        stagedFile.ownerAddress.toLowerCase() !== vault.owner.toLowerCase() ||
        stagedFile.proofHash.toLowerCase() !== vault.payloadHash.toLowerCase() ||
        stagedFile.keyCommitment.toLowerCase() !== vault.keyCommitment.toLowerCase() ||
        vault.payloadCid !== `mongo://${uploadId}`
      ) {
        response.status(409).json({ error: "On-chain vault does not match this staged upload" });
        return;
      }
      let receipt = await (typeof (service as any).getTransactionReceipt === "function"
        ? (service as any).getTransactionReceipt(body.transactionHash)
        : service.provider.getTransactionReceipt(body.transactionHash));
      for (const delayMs of [1000, 2000, 4000]) {
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        receipt = await (typeof (service as any).getTransactionReceipt === "function"
          ? (service as any).getTransactionReceipt(body.transactionHash)
          : service.provider.getTransactionReceipt(body.transactionHash));
      }
      const receiptDiagnostics = {
        transactionHash: body.transactionHash,
        receiptFound: Boolean(receipt),
        status: receipt?.status ?? null,
        receiptTo: receipt?.to ?? null,
        expectedContractAddress: service.contractAddress,
        blockNumber: receipt?.blockNumber ?? null,
        logCount: receipt?.logs.length ?? 0,
      };
      console.log("[anchor:receipt]", JSON.stringify(receiptDiagnostics));
      if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== service.contractAddress.toLowerCase()) {
        response.status(409).json({
          error: "Vault creation transaction is not confirmed for this contract",
          transactionHash: body.transactionHash,
          receiptFound: Boolean(receipt),
          status: receipt?.status ?? null,
          receiptTo: receipt?.to ?? null,
          expectedContractAddress: service.contractAddress,
          blockNumber: receipt?.blockNumber ?? null,
          logCount: receipt?.logs.length ?? 0,
          requestId: response.getHeader("x-request-id"),
        });
        return;
      }
      let matchingCreationEvent = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== service.contractAddress.toLowerCase()) continue;
        try {
          const event = service.contract.interface.parseLog(log);
          if (
            event?.name === "VaultCreated" &&
            BigInt(event.args.vaultId) === vaultId &&
            String(event.args.owner).toLowerCase() === vault.owner.toLowerCase() &&
            String(event.args.payloadHash).toLowerCase() === stagedFile.proofHash.toLowerCase()
          ) {
            matchingCreationEvent = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!matchingCreationEvent) {
        response.status(409).json({ error: "Transaction does not contain the matching VaultCreated event" });
        return;
      }
      const anchored = await vaultStore.anchorVaultFile({
        uploadId,
        vaultId: vaultId.toString(),
        anchorTxHash: receipt.hash,
        anchorBlockNumber: receipt.blockNumber,
      });
      if (!anchored) {
        const existing = await vaultStore.getVaultFileByUploadId(uploadId);
        if (
          existing?.status !== "ANCHORED" ||
          existing.vaultId !== vaultId.toString() ||
          existing.anchorTxHash?.toLowerCase() !== receipt.hash.toLowerCase()
        ) {
          response.status(409).json({ error: "Staged upload has already been anchored differently" });
          return;
        }
      }
      response.status(200).json({
        uploadId,
        vaultId: vaultId.toString(),
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: "ANCHORED",
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/vaults/:vaultId/proof", async (request, response, next) => {
    try {
      if (!vaultStore) {
        response.status(503).json({ error: "Encrypted file storage is not configured" });
        return;
      }
      const vaultId = getVaultIdParam(request);
      const vault = await service.getVault(vaultId);
      const chainId = (await service.chainId()).toString();
      const file = await vaultStore.getVaultFile(chainId, service.contractAddress, vaultId.toString());
      if (!file) {
        response.status(404).json({ error: "Anchored encrypted file was not found" });
        return;
      }
      const integrityError = verifyStoredProof(file, vault);
      if (integrityError) {
        response.status(409).json({ error: integrityError });
        return;
      }
      const signature = request.header("x-wallet-signature");
      if (!signature) {
        response.status(401).json({ error: "Owner wallet signature is required" });
        return;
      }
      let signerAddress: string;
      try {
        signerAddress = verifyMessage(
          vaultFileSignatureMessage("verify", chainId, service.contractAddress, vaultId.toString(), file.proofHash),
          signature,
        ).toLowerCase();
      } catch {
        response.status(401).json({ error: "Wallet signature is invalid" });
        return;
      }
      if (signerAddress !== vault.owner.toLowerCase()) {
        response.status(403).json({ error: "Only the vault owner can verify and release this file" });
        return;
      }
      if (vault.stateName !== "Triggered" && vault.stateName !== "Released") {
        response.status(409).json({ error: "Vault must be Triggered before the proof can be released" });
        return;
      }
      response.json({
        verified: true,
        proofHash: file.proofHash,
        plaintextSha256: file.plaintextSha256,
        encryptedPayloadSha256: file.encryptedPayloadSha256,
        encryptedMetadataSha256: file.encryptedMetadataSha256,
        keyCommitment: file.keyCommitment,
        status: vault.stateName,
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
      const vault = await service.getVault(vaultId);
      if (vault.stateName !== "Released") {
        response.status(403).json({ error: "Document can only be downloaded after its proof has been released on-chain" });
        return;
      }
      const chainId = (await service.chainId()).toString();
      const file = await vaultStore.getVaultFile(chainId, service.contractAddress, vaultId.toString());
      if (!file) {
        response.status(404).json({ error: "Anchored encrypted file was not found" });
        return;
      }
      const integrityError = verifyStoredProof(file, vault);
      if (integrityError) {
        response.status(409).json({ error: integrityError });
        return;
      }
      const signature = request.header("x-wallet-signature");
      if (!signature) {
        response.status(401).json({ error: "Owner wallet signature is required" });
        return;
      }
      let signerAddress: string;
      try {
        signerAddress = verifyMessage(
          vaultFileSignatureMessage("download", chainId, service.contractAddress, vaultId.toString(), file.proofHash),
          signature,
        ).toLowerCase();
      } catch {
        response.status(401).json({ error: "Wallet signature is invalid" });
        return;
      }
      if (signerAddress !== vault.owner.toLowerCase()) {
        response.status(403).json({ error: "Only the vault owner can download this file" });
        return;
      }
      response.json({
        uploadId: file.uploadId,
        vaultId: file.vaultId,
        ownerAddress: file.ownerAddress,
        plaintextSha256: file.plaintextSha256,
        encryptedPayloadSha256: file.encryptedPayloadSha256,
        encryptedMetadataSha256: file.encryptedMetadataSha256,
        proofHash: file.proofHash,
        keyCommitment: file.keyCommitment,
        iv: file.iv,
        metadataIv: file.metadataIv,
        encryptedData: file.encryptedData.toString("base64"),
        encryptedMetadata: file.encryptedMetadata.toString("base64"),
        wrappedKey: file.wrappedKey.toString("base64"),
      });
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
    const requestId = response.getHeader("x-request-id");
    console.error("[request:error]", JSON.stringify({
      requestId,
      method: _request.method,
      path: _request.originalUrl,
      error: formatError(error),
    }));
    const status = error instanceof z.ZodError || error instanceof BadRequestError
      ? 400
      : error instanceof multer.MulterError
        ? error.code === "LIMIT_FILE_SIZE" ? 413 : 400
        : /-32007|25\/second|rate limit|too many requests|429/i.test(JSON.stringify(formatError(error)))
          ? 503
        : 500;
    if (status === 503) response.setHeader("Retry-After", "5");
    response.status(status).json({ error: message, requestId });
  });

  return app;
}
