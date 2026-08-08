# 🛡️ Ghost Protocol — Autonomous Decentralized Dead Man's Switch

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![EVM Stack](https://img.shields.io/badge/Web3-Solidity%20%7C%20Ethers.js%20%7C%20IPFS-blue)](https://soliditylang.org/)
[![AI Infrastructure](https://img.shields.io/badge/AI-LangChain%20%7C%20OpenAI%20%7C%20FAISS-green)](https://www.langchain.com/)

**Ghost Protocol** is an autonomous, decentralized, AI-augmented "Dead Man's Switch". It provides high-risk individuals, whistleblowers, and investigative journalists with a tamper-resistant platform to store encrypted evidence on decentralized storage. 

If a user goes silent or if external verified events (such as arrests, news alerts, or death certificates) are cryptographically validated by an AI/Oracle layer, the platform automatically executes a smart contract to decrypt and publicly broadcast the evidence payload.

---

## 📋 Table of Contents
- [Executive Summary & Vision](#-executive-summary--vision)
- [Core User Roles](#-core-user-roles)
- [Functional Requirements](#-functional-requirements)
  - [Client-Side Encryption & IPFS Management](#1-client-side-encryption--ipfs-payload-management)
  - [Smart Contract Engine](#2-smart-contract-engine-Ghost Protocolsol)
  - [AI Verification & RAG Pipeline](#3-ai-verification--rag-pipeline)
- [System Architecture](#-system-architecture)
- [Technical Stack](#-technical-stack)
- [Non-Functional & Security Requirements](#-non-functional--security-requirements)
- [Repository Structure](#-repository-structure)
- [Implementation Milestones](#-implementation-milestones)
- [Getting Started](#-getting-started)

---

## 👁️ Executive Summary & Vision

Whistleblowers and investigative journalists face severe physical risks when holding damning evidence. **Ghost Protocol** solves this by establishing a decentralized, zero-trust mechanism that guarantees evidence release even if the key-holder is silenced, detained, or physically compromised.

By combining Web3 time-locked smart contracts, client-side AES-256 encryption, and AI-driven news/document verification, Ghost Protocol acts as a cryptographically enforced insurance policy.

---

## 👥 Core User Roles

| Role | Description |
| :--- | :--- |
| **Vault Creator (User)** | Encrypts and uploads evidence payloads, sets heartbeat intervals, and executes periodic check-ins via Web3 wallet. |
| **Oracle / AI Engine** | Automated off-chain service that monitors news feeds and parses legal documents/certificates to trigger emergency overrides. |
| **Public / Recipients** | Receives the decryption keys upon vault execution or accesses publicly leaked IPFS CIDs. |

---

## ⚙️ Functional Requirements

### 1. Client-Side Encryption & IPFS Payload Management
* **Zero-Knowledge Encryption:** Files are encrypted locally in the user's browser using **AES-256-GCM** before uploading. Plaintext media never touches a server or IPFS node.
* **Decentralized Hosting:** Encrypted binary payloads are pinned to the **IPFS / Arweave** network.
* **Integrity Hashing:** Computes a `keccak256` payload hash client-side and commits it to the smart contract upon vault creation.

### 2. Smart Contract Engine (`GhostProtocol.sol`)
* **Time-Lock Logic:** Configurable `checkInInterval` (e.g., 7 days) and `gracePeriod` (e.g., 48 hours).
* **Heartbeat Mechanism:** A `sendHeartbeat()` function updates `lastHeartbeat = block.timestamp`.
* **State Machine:** States cycle strictly through: `Active` ➔ `Triggered` ➔ `Released` / `Cancelled`.
* **Oracle Override:** `triggerViaOracle()` allows an authorized Oracle address (backed by Chainlink/AI) to force key release when external emergency criteria are met.

### 3. AI Verification & RAG Pipeline
* **Document Parsing Engine:** An asynchronous Python service utilizing **LangChain + LLMs** with structured Pydantic outputs to extract and validate official seals and hashes from death certificates, police reports (FIRs), or court orders.
* **News RAG Search:** A FAISS vector store and scraper monitoring global/local news feeds for context relating to the Vault Creator's identity (e.g., "missing", "detained", "deceased").
* **Biometric Check-In (Optional):** Liveness detection via webcam during heartbeat submission to prevent coerced check-ins.

---

## 🏗️ System Architecture

```text
+-------------------------------------------------------------------------+
|                              FRONTEND (Next.js)                         |
|  1. Encrypt File (AES-256) -> 2. Pin to IPFS -> 3. Commit Vault to Web3 |
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
|  - Python RAG/LLM: Scans News APIs & parses PDF certificate hashes     |
+-------------------------------------------------------------------------+


Ghost-Protocol/
├── package.json                   # Monorepo root scripts
├── turbo.json                     # Turborepo task pipeline
├── packages/
│   ├── contracts/                 # 📜 Web3 & Smart Contracts (Hardhat/Solidity)
│   │   ├── contracts/
│   │   │   └── GhostProtocol.sol
│   │   ├── scripts/
│   │   │   └── deploy.ts
│   │   └── test/
│   │       └── GhostProtocol.test.ts
│   │
│   ├── frontend/                  # 💻 Next.js 14 Web Application
│   │   ├── src/
│   │   │   ├── app/               # Routes (dashboard, create, vault view)
│   │   │   ├── components/        # Web3 UI, Encryption components
│   │   │   └── lib/               # AES-256 crypto helpers & IPFS SDK
│   │
│   └── backend-ai/                # 🤖 AI Engine & Oracle Execution Worker
│       ├── node-oracle/           # Node.js Cron Worker & Event Watcher
│       └── python-rag/            # LangChain PDF Verifier & News RAG Engine