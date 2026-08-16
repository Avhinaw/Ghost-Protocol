import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  ORACLE_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  ORACLE_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(6 * 60 * 60 * 1000),
  ORACLE_AUTO_TRIGGER: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AI_VERIFIER_URL: z.string().url().optional(),
  AI_ASSESSMENT_TTL_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  REVIEWER_APPROVAL_TOKEN: z.string().min(16).optional(),
});

export type BackendConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return envSchema.parse(env);
}
