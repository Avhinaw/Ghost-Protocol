# 🤖 Specification 03: Node.js Oracle Worker Service

**Target Sub-Package:** `packages/backend-ai/node-oracle`  
**Runtime:** Node.js LTS, TypeScript, Ethers.js v6  

---

## 1. System Responsibilities

The Node.js Oracle worker serves as the bidirectional bridge between the EVM blockchain and the Python AI microservice:

1. **Expiration Watcher (Cron):** Regularly scans on-chain vaults to check if any active vault has exceeded its heartbeat interval plus grace period.
2. **Event Listener:** Listens via WebSockets to `VaultCreated` and `HeartbeatReceived` events to update local caching stores.
3. **Transaction Relayer:** Signs and submits `checkAndTriggerExpired` and `triggerViaOracle` transactions using a dedicated hot-wallet private key.

---

## 2. Service Architecture & Execution Loop

```text
 ┌──────────────────────┐
 │  Cron (Every 6 hrs)  │
 └──────────┬───────────┘
            │
            ▼
 ┌──────────────────────┐      Vault Expired?      ┌─────────────────────────────┐
 │ Query Active Vaults  ├─────────────────────────►│ Send checkAndTriggerExpired │
 └──────────┬───────────┘            YES           └─────────────────────────────┘
            │
            ▼
 ┌──────────────────────┐      Alert Triggered?    ┌─────────────────────────────┐
 │ Poll Python AI API   ├─────────────────────────►│ Send triggerViaOracle TX    │
 └──────────────────────┘            YES           └─────────────────────────────┘