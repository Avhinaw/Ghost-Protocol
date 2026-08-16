import { createServer } from "node:http";
import { createApp } from "./app.js";
import { AssessmentRegistry } from "./assessment-registry.js";
import { HttpAiVerifierClient } from "./ai-verifier.js";
import { BlockchainService } from "./blockchain-service.js";
import { loadConfig } from "./config.js";
import { OracleWorker } from "./oracle-worker.js";

const config = loadConfig();
if (!config.CONTRACT_ADDRESS) {
  throw new Error("CONTRACT_ADDRESS is required to start the backend");
}

const service = new BlockchainService(
  config.RPC_URL,
  config.CONTRACT_ADDRESS,
  config.ORACLE_PRIVATE_KEY,
);
const aiVerifier = config.AI_VERIFIER_URL ? new HttpAiVerifierClient(config.AI_VERIFIER_URL) : undefined;
const assessmentRegistry = new AssessmentRegistry(config.AI_ASSESSMENT_TTL_MS);
const app = createApp(service, config.CORS_ORIGIN, aiVerifier, assessmentRegistry, config.REVIEWER_APPROVAL_TOKEN);
const server = createServer(app);
const worker = config.ORACLE_PRIVATE_KEY
  ? new OracleWorker(
      service,
      config.ORACLE_SCAN_INTERVAL_MS,
      config.ORACLE_AUTO_TRIGGER,
    )
  : undefined;

server.listen(config.PORT, () => {
  console.log(`Ghost Protocol backend listening on http://localhost:${config.PORT}`);
  console.log(`Contract: ${config.CONTRACT_ADDRESS}`);
  console.log(aiVerifier ? `AI verifier: ${config.AI_VERIFIER_URL}` : "AI verifier disabled");
  console.log(config.REVIEWER_APPROVAL_TOKEN ? "AI reviewer gate configured" : "AI reviewer gate disabled: REVIEWER_APPROVAL_TOKEN is not configured");
  if (worker) worker.start();
  else console.log("Oracle worker disabled: ORACLE_PRIVATE_KEY is not configured");
});

function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`);
  worker?.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
