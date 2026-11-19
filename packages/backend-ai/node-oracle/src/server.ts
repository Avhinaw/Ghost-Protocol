import { createServer } from "node:http";
import { createApp } from "./app.js";
import { AssessmentRegistry } from "./assessment-registry.js";
import { HttpAiVerifierClient } from "./ai-verifier.js";
import { BlockchainService } from "./blockchain-service.js";
import { loadConfig } from "./config.js";
import { OracleWorker } from "./oracle-worker.js";
import { MongoVaultStore } from "./mongo-vault-store.js";

const config = loadConfig();
if (!config.CONTRACT_ADDRESS) {
  throw new Error("CONTRACT_ADDRESS is required to start the backend");
}
const vaultStore = config.MONGODB_URI
  ? new MongoVaultStore(config.MONGODB_URI, config.MONGODB_DATABASE)
  : undefined;
if (vaultStore) await vaultStore.connect();

const service = new BlockchainService(
  config.RPC_URL,
  config.CONTRACT_ADDRESS,
  config.ORACLE_PRIVATE_KEY,
);

async function logStartupDiagnostics() {
  try {
    let rpcHost = "invalid-url";
    try {
      rpcHost = new URL(config.RPC_URL).host;
    } catch {
      rpcHost = "invalid-url";
    }
    const [chainId, blockNumber, contractCode] = await Promise.all([
      service.chainId(),
      service.provider.getBlockNumber(),
      service.provider.getCode(service.contractAddress),
    ]);
    console.log("[startup] Chain diagnostics:", JSON.stringify({
      chainId: chainId.toString(),
      blockNumber,
      rpcHost,
      contractAddress: config.CONTRACT_ADDRESS,
      contractCodePresent: contractCode !== "0x",
      contractCodeBytes: contractCode === "0x" ? 0 : (contractCode.length - 2) / 2,
    }));

    if (contractCode === "0x") {
      console.error(
        "[startup] CONTRACT_ADDRESS has no deployed bytecode on this RPC network:",
        config.CONTRACT_ADDRESS,
      );
    } else {
      try {
        console.log("[startup] vaultCount():", (await service.vaultCount()).toString());
      } catch (error) {
        console.error("[startup] vaultCount() failed:", formatError(error));
      }
    }
  } catch (error) {
    console.error("[startup] RPC diagnostics failed:", formatError(error));
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

void logStartupDiagnostics();
const aiVerifier = config.AI_VERIFIER_URL ? new HttpAiVerifierClient(config.AI_VERIFIER_URL) : undefined;
const assessmentRegistry = new AssessmentRegistry(config.AI_ASSESSMENT_TTL_MS);
const app = createApp(service, config.CORS_ORIGIN, aiVerifier, assessmentRegistry, config.REVIEWER_APPROVAL_TOKEN, vaultStore);
const server = createServer(app);
const worker = config.ORACLE_PRIVATE_KEY
  ? new OracleWorker(
      service,
      config.ORACLE_SCAN_INTERVAL_MS,
      config.ORACLE_AUTO_TRIGGER,
    )
  : undefined;

server.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Ghost Protocol backend listening on 0.0.0.0:${config.PORT}`);
  console.log(`Contract: ${config.CONTRACT_ADDRESS}`);
  console.log(aiVerifier ? `AI verifier: ${config.AI_VERIFIER_URL}` : "AI verifier disabled");
  console.log(config.REVIEWER_APPROVAL_TOKEN ? "AI reviewer gate configured" : "AI reviewer gate disabled: REVIEWER_APPROVAL_TOKEN is not configured");
  console.log(vaultStore ? "MongoDB vault storage connected" : "MongoDB vault storage disabled: MONGODB_URI is not configured");
  if (worker) worker.start();
  else console.log("Oracle worker disabled: ORACLE_PRIVATE_KEY is not configured");
});

function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`);
  worker?.stop();
  server.close(() => {
    if (!vaultStore) {
      process.exit(0);
      return;
    }
    void vaultStore.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("Failed to close MongoDB connection:", error);
        process.exit(1);
      },
    );
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
