# Ghost Protocol — Encrypted Evidence Vault Prototype

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![EVM Stack](https://img.shields.io/badge/Web3-Solidity%20%7C%20Ethers.js-blue)](https://soliditylang.org/)
[![AI Infrastructure](https://img.shields.io/badge/AI-FastAPI%20%7C%20structured%20review-green)](https://fastapi.tiangolo.com/)

**Ghost Protocol** is a prototype for encrypted evidence vaults with heartbeat timeouts and a human-reviewed emergency-trigger flow. It combines a browser frontend, an EVM smart contract, a Node.js oracle API, and a Python document-assessment service.

This is not a production safety or evidence-custody system. The AI service only returns a structured recommendation; a valid reviewer approval is required before an AI-assisted oracle trigger. News retrieval, IPFS upload, production reviewer identity, durable recipient-key recovery, and biometric check-in are not implemented. Use synthetic data and local/test networks only.

---

## 📋 Table of Contents
- [Executive Summary & Vision](#-executive-summary--vision)
- [Core User Roles](#-core-user-roles)
- [Functional Requirements](#-functional-requirements)
  - [Client-Side Encryption & Encrypted Payload Storage](#1-client-side-encryption--encrypted-payload-storage)
  - [Smart Contract Engine](#2-smart-contract-engine-ghostprotocolsol)
  - [AI Document Assessment](#3-ai-document-assessment)
- [System Architecture](#-system-architecture)
- [Repository Structure](#-repository-structure)
- [Local validation](#local-validation)
- [Prototype boundaries](#prototype-boundaries)

---

## Executive Summary & Vision

Ghost Protocol explores a blockchain-backed heartbeat and encrypted-vault workflow for users who need a controlled release mechanism for sensitive evidence.

The current repository is a working prototype, not a guarantee of release, secrecy, or safety. Its demo uses synthetic content, a temporary in-memory review registry, and a user-held passphrase with no recovery mechanism.

---

## Core User Roles

| Role | Description |
| :--- | :--- |
| **Vault Creator (User)** | Encrypts and uploads evidence payloads, sets heartbeat intervals, and executes periodic check-ins via Web3 wallet. |
| **Oracle / AI Engine** | Node service reads vaults and relays permitted actions; Python service produces document assessments. AI does not trigger a vault on its own. |
| **Public / Recipients** | Can read on-chain vault status. Production payload distribution and key custody are not provided. |

---

## Functional Requirements

### 1. Client-Side Encryption & Encrypted Payload Storage
* **Browser encryption:** The frontend prototype encrypts selected files using **AES-256-GCM** before vault creation.
* **Storage:** The browser stages client-encrypted binary files and filename/MIME metadata in MongoDB and commits a `mongo://<uploadId>` CID plus the SHA-256 proof-manifest hash on-chain. IPFS/Arweave is not implemented.
* **Proof-gated release:** After `Triggered`, the backend recomputes the encrypted file, encrypted filename/MIME metadata, and proof-manifest hashes; the owner calls `releaseVaultWithProof`; and the browser decrypts and rechecks the plaintext SHA-256 only after the chain reports `Released`.
* **Key custody:** The AES key is wrapped under an Argon2id-derived key from a user-held passphrase. The passphrase and plaintext are not stored or sent to the backend. A forgotten or weak passphrase cannot be recovered; do not store real or irreplaceable evidence.

### 2. Smart Contract Engine (`GhostProtocol.sol`)
* **Time-Lock Logic:** Configurable `checkInInterval` (e.g., 7 days) and `gracePeriod` (e.g., 48 hours).
* **Heartbeat Mechanism:** A `sendHeartbeat()` function updates `lastHeartbeat = block.timestamp`.
* **State Machine:** States cycle strictly through: `Active` ➔ `Triggered` ➔ `Released` / `Cancelled`.
* **Oracle Override:** `triggerViaOracle()` allows an authorized oracle to move a vault to `Triggered`; the contract does not evaluate AI or external evidence.

### 3. AI Document Assessment
* **Document assessment:** Python/FastAPI accepts text or text-based PDFs and returns a structured assessment. Mock mode is deterministic; live mode uses an OpenAI-compatible endpoint.
* **Human review gate:** Node stores an assessment temporarily and requires explicit reviewer approval before the AI-assisted trigger.
* **Not implemented:** News RAG, source scraping, OCR, biometric check-in, and identity verification.

---

## System Architecture

```text
+-------------------------------------------------------------------------+
|                               FRONTEND (Vite)                            |
|       1. Encrypt locally -> 2. Demo CID -> 3. Create vault on Web3       |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                      SMART CONTRACT (Base / EVM)                       |
|   - Stores vault metadata, proof hash, heartbeat state, release status  |
+------------------------------------+------------------------------------+
                                     ^
                                     | (Oracle Calls / Cron Checks)
+------------------------------------+------------------------------------+
|                      BACKEND & AI ORACLE SERVICE                        |
|  - Node.js Cron Service: Checks time-lock expirations                   |
|  - Python FastAPI: Structured text/PDF assessment                       |
|  - MongoDB: Holds staged/anchored ciphertext and wrapped key             |
|  - Human-review gate: Required before AI-assisted oracle trigger         |
+-------------------------------------------------------------------------+
```

## Repository Structure

```text
Ghost-Protocol/
├── packages/
│   ├── contracts/                 # Solidity contract, Hardhat tests and local flow
│   ├── frontend/                  # Vite/React application, API and reviewer UI
│   └── backend-ai/
│       ├── node-oracle/           # Node.js API, oracle relay and assessment gate
│       └── python-rag/            # FastAPI text/PDF assessment service
```

## Local validation

Run checks from each package directory:

```bash
cd packages/contracts
npm run compile
npm test

cd ../backend-ai/node-oracle
npm test
npx tsc --noEmit

cd ../python-rag
python -m pytest -q

cd ../../frontend
pnpm check
pnpm test
pnpm build
```

For the complete local AI-review-to-contract demonstration, follow [AI_INTEGRATION.md](./AI_INTEGRATION.md). It uses synthetic evidence, the local Hardhat chain, and explicit human approval.

## Prototype boundaries

This repository is not ready for real evidence or production deployment. Assessments remain in memory; recipient-key recovery and production reviewer identity are not implemented; no news RAG/OCR is included. The proof-release contract changes are incompatible with earlier deployments: deploy the updated contract and configure the new address in the backend and frontend before testing. Review [BLOCKCHAIN_IMPLEMENTATION.md](./BLOCKCHAIN_IMPLEMENTATION.md) and [docs/ENVIRONMENT_AND_SECRETS.md](./docs/ENVIRONMENT_AND_SECRETS.md) before deployment.
