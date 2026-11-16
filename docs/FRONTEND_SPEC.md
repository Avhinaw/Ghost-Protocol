# Frontend and browser encryption

**Target package:** `packages/frontend`
**Implemented framework:** Vite and React
**Status:** Local prototype connected to the Ghost Protocol contract and Node API.

## Current user flows

- Browse the application and view vault status.
- Connect a browser wallet and create a vault, send a heartbeat, or cancel an active vault.
- Use the reviewer console to upload synthetic evidence, inspect a structured assessment, explicitly reject or approve it, and request the Node oracle trigger.
- Retrieve read-only vault/configuration information from the Node service.

The browser signs owner actions with the user's wallet. It does not receive the oracle private key or reviewer token. Oracle operations belong to the backend.

## Encryption and storage boundaries

The create flow encrypts arbitrary binary files and filename/MIME metadata in the browser using AES-256-GCM, hashes the plaintext and both encrypted payloads, and builds a canonical proof-v2 manifest. It stages ciphertext, encrypted metadata, and the Argon2id/passphrase-wrapped AES key in MongoDB before creating a vault with a `mongo://<uploadId>` CID and the proof hash. Once the vault is `Triggered`, the owner verifies the stored proof and calls `releaseVaultWithProof`; after the chain reports `Released`, the backend returns only encrypted data and the browser decrypts and rechecks the plaintext SHA-256. The passphrase stays in browser memory only and has no reset/recovery flow. Do not use real evidence.

Before any real evidence use, the project needs a reviewed recipient recovery plan, durable and access-controlled reviewer records, and validated deployment configuration. Stolen encrypted records can be attacked offline if the passphrase is weak. Scanned-document OCR and production reviewer authentication are also not provided. The proof-release contract requires a new deployment; it is incompatible with the old raw-key contract.

## Local checks

Run from `packages/frontend`:

```bash
pnpm check
pnpm test
pnpm build
```

See [LOCAL_TESTING.md](../packages/frontend/LOCAL_TESTING.md) and [LOCAL_REVIEWER_CONSOLE.md](../packages/frontend/LOCAL_REVIEWER_CONSOLE.md) for synthetic local workflows.
