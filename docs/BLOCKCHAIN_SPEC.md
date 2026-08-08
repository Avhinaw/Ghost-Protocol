# 📜 Specification 01: EVM Smart Contract Engine

**Target Sub-Package:** `packages/contracts`  
**Primary Artifact:** `GhostProtocol.sol`  
**Interface:** `IGhostProtocol.sol`  

---

## 1. State Machine Rules

```text
       ┌──────────────┐
       │    Active    │
       └──────┬───────┘
              │
      ┌───────┼─────────────────────────┐
      │       │                         │
      ▼       ▼                         ▼
┌──────────┐ ┌──────────┐         ┌───────────┐
│Triggered │ │ Released │         │ Cancelled │
└──────────┘ └──────────┘         └───────────┘