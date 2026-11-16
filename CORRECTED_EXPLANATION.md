# Ghost Protocol — Current Project Explanation

## What the project does

Ghost Protocol is a prototype for evidence vaults with owner heartbeats and contract-enforced state transitions. A missed heartbeat can make a vault eligible for a timeout trigger. A separate emergency trigger can be sent by an authorized oracle. The contract enforces permissions and lifecycle rules; it does not interpret documents or decide whether an emergency is real.

The frontend encrypts arbitrary binary files and filename/MIME metadata in the browser and stages only ciphertext, encrypted metadata, and a recipient-wrapped AES key in MongoDB. The contract stores a SHA-256 proof-manifest hash and `mongo://<uploadId>` reference. The AI service provides a mock or live structured assessment of submitted text or text-based PDFs. An AI-assisted oracle trigger requires a stored assessment and explicit reviewer approval in the Node service.

## Current system path

1. A user connects a browser wallet; the browser encrypts the file and its filename/MIME metadata, then hashes the plaintext and encrypted payloads.
2. The browser stages ciphertext, encrypted metadata, and the wrapped AES key in MongoDB with a signed proof manifest.
3. The owner creates the vault with the manifest hash; the backend verifies the mined creation receipt and anchors the staged record.
4. The owner can send heartbeats or cancel an active vault.
5. The Node worker can scan for expired vaults; automatic relaying is disabled by default.
6. For an emergency-review flow, the Node API sends uploaded evidence to the Python verifier and temporarily stores its assessment.
7. A reviewer explicitly approves the eligible assessment; the Node oracle signer submits the trigger.
8. After `Triggered`, the backend checks the MongoDB record against chain; the owner submits the matching proof hash, and after `Released` the browser downloads, decrypts, and rehashes the original file.

## What is implemented

| Area | Current implementation |
|---|---|
| Smart contract | Vault creation, heartbeat, cancellation, timeout trigger, authorized-oracle trigger, and owner-only proof-hash release. |
| Frontend | Vite/React app with wallet-based vault actions, client-side binary encryption, proof-gated release/download, and reviewer console. |
| Node backend | Express APIs for config and vault reads, staged MongoDB ciphertext storage, chain anchoring, proof checks, expiry scanning/relaying, Python verifier requests, and reviewer-gated oracle actions. |
| Python service | FastAPI health, text and document assessment endpoints, deterministic mock mode, and optional OpenAI-compatible live mode. |
| Integration | Synthetic document-to-assessment-to-review-to-oracle-to-release local flow. |

## Explicitly not implemented

News retrieval/RAG, external news scraping, scanned-document OCR, IPFS/Arweave payload upload, durable assessment storage, authenticated multi-reviewer accounts and audit records, and recipient passphrase recovery are still outstanding. A forgotten passphrase means loss of access; a weak one may be guessed offline if the database is stolen. Do not upload real evidence or deploy with real keys.

## Recommended next work

The next blocker is secure **recipient-key backup and recovery** before any real evidence use. After that, prioritize durable reviewer identity/audit records. News RAG/OCR can follow only with defined source provenance, identity-matching safeguards, and false-positive policy. The updated proof-release contract must be deployed to a new address; the earlier deployment is incompatible.

Use [README.md](./README.md) for package-level checks, [AI_INTEGRATION.md](./AI_INTEGRATION.md) for the synthetic local flow, and [docs/ENVIRONMENT_AND_SECRETS.md](./docs/ENVIRONMENT_AND_SECRETS.md) for environment variables.
