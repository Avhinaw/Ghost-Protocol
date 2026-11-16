# EVM Smart Contract Engine

**Package:** `packages/contracts`
**Primary contract:** `GhostProtocol.sol`
**Status:** Local/testnet prototype. The state machine does not validate real-world evidence or secure production key custody.

## Lifecycle

```text
Active
  ├─ owner heartbeat ──────────────────────► Active
  ├─ owner cancellation ───────────────────► Cancelled
  ├─ permissionless trigger after timeout ─► Triggered
  └─ authorized oracle emergency trigger ─► Triggered

Triggered + owner submits matching proof hash ─► Released
```

The contract stores the proof-manifest hash and wrapped-key commitment, never document bytes or raw keys. It enforces the owner, time, and proof-hash conditions for state transitions. It does not call the AI verifier, inspect a PDF, establish identity, or decide whether an emergency is genuine.

## Prototype key warning

The release transaction submits only the proof hash; it reveals no document or AES key. The AES key is wrapped using an Argon2id key derived from the recipient's passphrase. The passphrase is not stored, and recovery is not available; the system remains a prototype and must not be used for real evidence.

## Validation

Run `npm run compile` and `npm test` from `packages/contracts`. For details and the local-chain demo, see [BLOCKCHAIN_IMPLEMENTATION.md](../BLOCKCHAIN_IMPLEMENTATION.md).
