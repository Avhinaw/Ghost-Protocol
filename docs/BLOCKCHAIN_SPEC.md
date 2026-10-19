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

Triggered + matching release key ─────────► Released
```

The contract stores vault metadata and a commitment to the release key. It enforces the time and caller conditions for state transitions. It does not call the AI verifier, inspect a PDF, establish identity, or decide whether an emergency is genuine.

## Prototype key warning

The current release transaction submits the matching key publicly on-chain. Anyone monitoring the network can observe transaction data. This is a demonstration mechanism only and must not be used for confidential evidence or production deployment. Threshold key custody or another independently reviewed release design is a prerequisite to real use.

## Validation

Run `npm run compile` and `npm test` from `packages/contracts`. For details and the local-chain demo, see [BLOCKCHAIN_IMPLEMENTATION.md](../BLOCKCHAIN_IMPLEMENTATION.md).
