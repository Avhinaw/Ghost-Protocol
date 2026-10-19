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

The create flow encrypts files in the browser using AES-GCM and computes the values needed for vault creation. The current storage integration uses a `local://` demo CID; it does not upload to IPFS or Arweave. The prototype release-key flow is not secure key custody. Do not use real evidence or depend on this for recovery.

Before any public deployment, the project needs a reviewed key-release design, real encrypted-payload storage, durable and access-controlled reviewer records, and validated deployment configuration. Scanned-document OCR and production reviewer authentication are also not provided.

## Local checks

Run from `packages/frontend`:

```bash
pnpm check
pnpm test
pnpm build
```

See [LOCAL_TESTING.md](../packages/frontend/LOCAL_TESTING.md) and [LOCAL_REVIEWER_CONSOLE.md](../packages/frontend/LOCAL_REVIEWER_CONSOLE.md) for synthetic local workflows.
