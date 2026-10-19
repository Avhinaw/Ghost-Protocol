# Ghost Protocol — Encrypted Evidence Vault Prototype

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![EVM Stack](https://img.shields.io/badge/Web3-Solidity%20%7C%20Ethers.js-blue)](https://soliditylang.org/)
[![AI Infrastructure](https://img.shields.io/badge/AI-FastAPI%20%7C%20structured%20review-green)](https://fastapi.tiangolo.com/)

**Ghost Protocol** is a prototype for encrypted evidence vaults with heartbeat timeouts and a human-reviewed emergency-trigger flow. It combines a browser frontend, an EVM smart contract, a Node.js oracle API, and a Python document-assessment service.

This is not a production safety or evidence-custody system. The AI service only returns a structured recommendation; a valid reviewer approval is required before an AI-assisted oracle trigger. News retrieval, IPFS upload, production key custody, and biometric check-in are not implemented. Use synthetic data and a local chain only.

---

## 📋 Table of Contents
- [Executive Summary & Vision](#-executive-summary--vision)
- [Core User Roles](#-core-user-roles)
- [Functional Requirements](#-functional-requirements)
  - [Client-Side Encryption & IPFS Management](#1-client-side-encryption--ipfs-payload-management)
  - [Smart Contract Engine](#2-smart-contract-engine-ghostprotocolsol)
  - [AI Document Assessment](#3-ai-document-assessment)
- [System Architecture](#-system-architecture)
- [Repository Structure](#-repository-structure)
- [Local validation](#local-validation)
- [Prototype boundaries](#prototype-boundaries)

---

## Executive Summary & Vision

Ghost Protocol explores a blockchain-backed heartbeat and encrypted-vault workflow for users who need a controlled release mechanism for sensitive evidence.

The current repository is a working local prototype, not a guarantee of release, secrecy, or safety. Its local demo uses synthetic content, a temporary in-memory review registry, and a prototype release-key design.

---

## Core User Roles

| Role | Description |
| :--- | :--- |
| **Vault Creator (User)** | Encrypts and uploads evidence payloads, sets heartbeat intervals, and executes periodic check-ins via Web3 wallet. |
| **Oracle / AI Engine** | Node service reads vaults and relays permitted actions; Python service produces document assessments. AI does not trigger a vault on its own. |
| **Public / Recipients** | Can read on-chain vault status. Production payload distribution and key custody are not provided. |

---

## Functional Requirements

### 1. Client-Side Encryption & IPFS Payload Management
* **Browser encryption:** The frontend prototype encrypts selected files using **AES-256-GCM** before vault creation.
* **Storage:** The current create flow uses a `local://` demo CID; IPFS/Arweave upload is not implemented.
* **Key custody:** Prototype only. Do not store real evidence or rely on this flow for recovery.

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
|   - Stores Vault Meta, Hashes, Heartbeat Timestamps, Release Keys       |
+------------------------------------+------------------------------------+
                                     ^
                                     | (Oracle Calls / Cron Checks)
+------------------------------------+------------------------------------+
|                      BACKEND & AI ORACLE SERVICE                        |
|  - Node.js Cron Service: Checks time-lock expirations                   |
|  - Python FastAPI: Structured text/PDF assessment                       |
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

This repository is not ready for real evidence or production deployment. The current workflow has a `local://` payload CID, temporary in-memory assessment storage, a prototype key-release design, no implemented news RAG/OCR, and no production reviewer identity system. Review [BLOCKCHAIN_IMPLEMENTATION.md](./BLOCKCHAIN_IMPLEMENTATION.md) and [docs/ENVIRONMENT_AND_SECRETS.md](./docs/ENVIRONMENT_AND_SECRETS.md) before deployment.
