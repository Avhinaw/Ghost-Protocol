# Node.js Oracle API and Worker

**Target package:** `packages/backend-ai/node-oracle`
**Runtime:** Node.js, TypeScript, Express 5, Ethers.js v6
**Status:** Local prototype. The service is wired to the Python verifier and EVM contract; reviewer authentication and durable operations are not production-ready.

## Responsibilities

1. **Vault API:** Returns frontend-ready contract configuration and vault records.
2. **Expiry worker:** Periodically scans vaults. Transaction execution is disabled by default and controlled by `ORACLE_AUTO_TRIGGER`.
3. **Document bridge:** Sends text or multipart documents to the configured Python verifier and stores assessments temporarily in memory.
4. **Reviewed trigger:** Requires a stored, unexpired eligible assessment, explicit reviewer approval, reviewer identity, and a server-side token before submitting `triggerViaOracle`.

## Implemented integration path

```text
Frontend
  -> Node API
  -> Python document assessment
  -> temporary assessment registry
  -> explicit reviewer approval
  -> Node oracle signer
  -> GhostProtocol.sol
```

The AI service is not polled for news and does not initiate transactions. The service does not currently implement a WebSocket event cache, durable assessment store, reviewer accounts, audit log, or retry/idempotency queue. Keep automatic expiry relaying disabled until its operational policy has been reviewed.

## API and local setup

Available routes include `GET /health`, `GET /api/v1/config`, `GET /api/v1/vaults`, `GET /api/v1/vaults/:vaultId`, `POST /api/v1/oracle/scan`, `POST /api/v1/ai/verify-text`, `POST /api/v1/ai/verify-document`, and the guarded `POST /api/v1/oracle/vaults/:vaultId/ai-reviewed-trigger`.

Set `CONTRACT_ADDRESS` and `RPC_URL` for the deployed contract and chain. Configure `AI_VERIFIER_URL` to enable assessments and `REVIEWER_APPROVAL_TOKEN` to enable the prototype review gate. Keep `ORACLE_AUTO_TRIGGER=false` unless intentionally testing timeout transactions on a local chain.

Run backend checks from the package directory:

```bash
npm test
npx tsc --noEmit
```

The full synthetic local integration flow is documented in [AI_INTEGRATION.md](../AI_INTEGRATION.md). Do not use real evidence or public-network private keys with this prototype.
