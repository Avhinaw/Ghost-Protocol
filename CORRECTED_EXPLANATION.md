# Ghost Protocol — Current Project Explanation

## What the project does

Ghost Protocol is a prototype for evidence vaults with owner heartbeats and contract-enforced state transitions. A missed heartbeat can make a vault eligible for a timeout trigger. A separate emergency trigger can be sent by an authorized oracle. The contract enforces permissions and lifecycle rules; it does not interpret documents or decide whether an emergency is real.

The frontend encrypts selected content in the browser, but its current upload location is a `local://` demo CID. The AI service provides a mock or live structured assessment of submitted text or text-based PDFs. An AI-assisted oracle trigger requires a stored assessment and explicit reviewer approval in the Node service.

## Current system path

1. A user connects a browser wallet and creates a vault through the frontend.
2. The browser encrypts the selected content; the current prototype does not upload it to IPFS or Arweave.
3. The contract records vault metadata, a payload hash/CID, and key commitment.
4. The owner can send heartbeats or cancel an active vault.
5. The Node worker can scan for expired vaults; automatic relaying is disabled by default.
6. For an emergency-review flow, the Node API sends uploaded evidence to the Python verifier and temporarily stores its assessment.
7. A reviewer explicitly approves the eligible assessment; the Node oracle signer submits the trigger.
8. The local demo manually submits the matching release key to finish the contract lifecycle.

## What is implemented

| Area | Current implementation |
|---|---|
| Smart contract | Vault creation, heartbeat, cancellation, timeout trigger, authorized-oracle trigger, and release-key commitment checks. |
| Frontend | Vite/React app with wallet-based vault actions, local encryption prototype, and reviewer console. |
| Node backend | Express APIs for config and vault reads, expiry scanning/relaying, Python verifier requests, and reviewer-gated oracle actions. |
| Python service | FastAPI health, text and document assessment endpoints, deterministic mock mode, and optional OpenAI-compatible live mode. |
| Integration | Synthetic document-to-assessment-to-review-to-oracle-to-release local flow. |

## Explicitly not implemented

News retrieval/RAG, external news scraping, scanned-document OCR, actual IPFS/Arweave payload upload, durable assessment storage, authenticated multi-reviewer accounts and audit records, and production-grade key custody are still outstanding. The local prototype writes the release key in a public transaction; therefore it does not provide confidential production release. Do not upload real evidence or deploy with real keys.

## Recommended next work

The next blocker is a reviewed **key-custody and release design** before testnet or real evidence use. After that, prioritize a real encrypted storage integration and durable reviewer identity/audit records. News RAG/OCR can follow only with defined source provenance, identity-matching safeguards, and false-positive policy.

Use [README.md](./README.md) for package-level checks, [AI_INTEGRATION.md](./AI_INTEGRATION.md) for the synthetic local flow, and [docs/ENVIRONMENT_AND_SECRETS.md](./docs/ENVIRONMENT_AND_SECRETS.md) for environment variables.
