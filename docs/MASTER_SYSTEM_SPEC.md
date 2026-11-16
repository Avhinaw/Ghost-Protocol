# Ghost Protocol Master System Specification

**Status:** Prototype architecture; not production-ready
**System:** Encrypted vault with heartbeat timeouts and explicit human-reviewed emergency triggers

## Purpose and safety boundaries

Ghost Protocol explores a user-controlled vault whose state is managed by an EVM smart contract. Owners can create vaults, send heartbeats, and cancel active vaults. Expired vaults can be triggered by the timeout path; emergency triggers require an authorized oracle.

The Python verifier returns a structured evidence assessment only. It cannot sign transactions, establish a person's identity or status, or release a key. The Node service requires a stored assessment and explicit reviewer approval before relaying an AI-assisted trigger. AI assessments are not proof of authenticity.

## Implemented local architecture

```text
Browser
  ├─ AES-GCM encrypt arbitrary binary file
  ├─ hash plaintext/ciphertext proof manifest
  ├─ stage ciphertext and wrapped key in MongoDB
  └─ sign owner chain and proof actions with connected wallet
           │
           ├──────────────► GhostProtocol.sol
           │                 vault state, proof hash, heartbeats, release gate
           ▼
Node oracle API
  ├─ reads vaults and contract configuration
  ├─ verifies staged upload and on-chain anchor
  ├─ verifies MongoDB bytes before owner proof release
  ├─ returns encrypted bytes only after chain release
  ├─ sends submitted text/PDF to Python service
  ├─ temporarily stores assessment in memory
  └─ relays oracle trigger after reviewer approval
           │
           ▼
Python FastAPI verifier
  └─ mock or live structured text/text-based-PDF assessment
```

## Implemented and not implemented

Implemented for local synthetic use: proof-hash contract lifecycle, browser encryption, MongoDB staged/anchored ciphertext API, frontend wallet flows, expiry worker, Python structured assessment, and reviewer approval gate.

Not implemented: recipient passphrase recovery, IPFS/Arweave uploads, OCR for scanned PDFs, news retrieval/RAG, durable assessment storage, production reviewer identities/audit records, and production oracle operations.

The release transaction exposes only a proof hash. The service never receives the recipient passphrase, but has no recovery path for it and stolen ciphertext permits offline passphrase guessing. Never store real evidence or rely on this system for confidential or guaranteed future publication. The proof-release contract is incompatible with the earlier raw-key deployment and must be deployed to a new address. See the package specifications and [ENVIRONMENT_AND_SECRETS.md](./ENVIRONMENT_AND_SECRETS.md) before setup.
