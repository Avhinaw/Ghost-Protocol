# Ghost Protocol Master System Specification

**Status:** Prototype architecture; not production-ready
**System:** Encrypted vault with heartbeat timeouts and explicit human-reviewed emergency triggers

## Purpose and safety boundaries

Ghost Protocol explores a user-controlled vault whose state is managed by an EVM smart contract. Owners can create vaults, send heartbeats, and cancel active vaults. Expired vaults can be triggered by the timeout path; emergency triggers require an authorized oracle.

The Python verifier returns a structured evidence assessment only. It cannot sign transactions, establish a person's identity or status, or release a key. The Node service requires a stored assessment and explicit reviewer approval before relaying an AI-assisted trigger. AI assessments are not proof of authenticity.

## Implemented local architecture

```text
Browser
  ├─ encrypt selected payload locally
  ├─ use current local:// demo CID
  └─ sign owner actions with connected wallet
           │
           ├──────────────► GhostProtocol.sol
           │                 vault state, heartbeats, trigger permissions
           ▼
Node oracle API
  ├─ reads vaults and contract configuration
  ├─ sends submitted text/PDF to Python service
  ├─ temporarily stores assessment in memory
  └─ relays oracle trigger after reviewer approval
           │
           ▼
Python FastAPI verifier
  └─ mock or live structured text/text-based-PDF assessment
```

## Implemented and not implemented

Implemented for local synthetic use: contract lifecycle, frontend wallet flows, Node vault APIs and expiry worker, Python structured assessment, reviewer approval gate, and a synthetic document-to-contract flow.

Not implemented: production key custody, actual IPFS/Arweave uploads, OCR for scanned PDFs, news retrieval/RAG, durable assessment storage, production reviewer identities/audit records, and production oracle operations.

The local prototype's release-key transaction is public on-chain. Never store real evidence or use this system to rely on confidential or guaranteed future publication. See the package specifications and [ENVIRONMENT_AND_SECRETS.md](./ENVIRONMENT_AND_SECRETS.md) before local setup.
