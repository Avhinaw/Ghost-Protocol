import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { BlockchainService, type VaultRecord } from "./blockchain-service.js";

const triggerBodySchema = z.object({
  evidenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

const executeBodySchema = z.object({
  execute: z.boolean().default(false),
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

export function createApp(service: BlockchainService, corsOrigin = "http://localhost:3000") {
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
