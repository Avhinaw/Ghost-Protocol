# Ghost Protocol Blockchain Implementation

## Implemented

The blockchain package now contains:

- `contracts/IGhostProtocol.sol`, which defines the vault interface, lifecycle states, events, and external actions.
- `contracts/GhostProtocol.sol`, which implements vault creation, proof-hash and wrapped-key commitment storage, owner heartbeats, timeout detection, owner cancellation, authorized-oracle emergency triggers, proof-matched release, and audit events.
- `test/GhostProtocol.test.ts`, with six passing tests covering the normal lifecycle, access control, timeout triggering, oracle triggering, invalid configuration, and proof-hash release checks.
- `scripts/deploy.ts`, which deploys the contract to a selected network and prints the address.
- `scripts/local-flow.ts`, which runs the complete local demonstration from deployment to final release.
- Hardhat 3 configuration with local Hardhat, localhost JSON-RPC, and Base Sepolia network definitions.

## Important prototype limitation

The contract stores no document bytes or raw keys. The browser encrypts both file contents and filename/MIME metadata, then wraps the AES key with an Argon2id-derived key from a recipient passphrase; MongoDB stores ciphertext and the wrapped AES key, never the passphrase or clear file metadata. The owner may call `releaseVaultWithProof` only after `Triggered`, and the submitted proof hash must match the on-chain commitment. The API separately verifies the file and metadata ciphertext hashes before release and only serves encrypted data after `Released`. A forgotten passphrase cannot be recovered, and a weak passphrase permits offline guessing if the database is stolen.

The contract does not decide whether a real person has died. It only enforces blockchain state transitions. An off-chain oracle must decide whether an emergency condition is sufficiently verified and then call `triggerViaOracle`.

## What I need from you before testnet deployment

| Decision | Why it matters |
|---|---|
| **Heartbeat interval and grace period** | These determine when a vault may be triggered. The current contract accepts intervals from one hour to 365 days and grace periods up to 30 days. |
| **Who controls the oracle** | The current prototype supports an owner-controlled authorized-oracle list. For production, choose a multisig or threshold oracle instead of one hot wallet. |
| **What evidence is stored** | Decide whether the payload is a document, video, archive, or multiple files, and define maximum size and metadata rules. |
| **Recipient recovery** | Decide whether to add a user-controlled recovery mechanism; the current passphrase cannot be reset by the service. |
| **Emergency trigger policy** | Decide whether AI can only recommend a trigger, whether a human must approve it, or whether multiple independent oracle confirmations are required. |
| **Target chain** | Local Hardhat is ready. Base Sepolia is configured but requires your RPC, deployer/oracle key, and explorer key. |

Never send private keys or API secrets in chat. Put them only in a local `.env` file that is excluded from Git.

## Local test flow

### Prerequisites

Install Node.js 22 or a compatible current LTS version. Then enter the contract package:

```bash
cd packages/contracts
npm install
```

### 1. Run the automated tests

These tests use an in-memory Hardhat chain and do not require a wallet, RPC URL, IPFS, or OpenAI key:

```bash
npm run compile
npm test
```

Expected result:

```text
6 passing
```

The test suite checks:

- A user can create an active vault.
- Only the vault owner can send heartbeats or cancel it.
- A vault expires after its check-in interval plus grace period.
- Anyone can call the permissionless timeout trigger after expiry.
- Only an authorized oracle can call the emergency trigger.
- Only the vault owner can release a `Triggered` vault, and only with the exact on-chain proof hash.
- Invalid configuration is rejected.

### 2. Run the complete local demo

Start a persistent local blockchain in terminal one:

```bash
cd packages/contracts
npm run node
```

Leave that terminal running. It prints funded development accounts whose private keys are intentionally public and must never be used on a real network.

In terminal two, run:

```bash
cd packages/contracts
npm run local:flow
```

The script deploys a fresh contract, creates a synthetic vault, sends a heartbeat, advances local time past the deadline, triggers the expired vault, submits its matching proof hash as the owner, and prints the final `Released` state. It tests the contract state machine only, not the MongoDB document flow.

Expected final output includes:

```text
6. Time advanced; expired: true
7. Timeout trigger: Triggered
8. Matching proof hash verified; final state: Released
Local Ghost Protocol flow completed successfully.
```

### 3. Deploy separately to the local node

If you want to inspect the contract address separately:

```bash
npm run deploy:local
```

The local deployment address is printed by the script. Use that address later in the frontend environment as:

```ini
VITE_CONTRACT_ADDRESS=<printed-local-address>
```

The local chain uses chain ID `31337` and RPC URL `http://127.0.0.1:8545`.

## Current blockchain flow

```text
createVault()
    ↓
Active
    ├── owner calls sendHeartbeat() → Active with a new deadline
    ├── owner calls cancelVault() → Cancelled
    ├── anyone calls checkAndTriggerExpired() after deadline → Triggered
    └── authorized oracle calls triggerViaOracle(evidenceHash) → Triggered

Triggered + owner submits matching proof hash
    ↓
Released
```

## Remaining work before any production use

The frontend, Node oracle, Python assessment service, and contract now have a synthetic local integration flow. The proof-release contract is incompatible with the earlier deployment that stored raw release keys. Deploy the updated contract and update the Render and frontend addresses before testing. Do not deploy it with real evidence; the passphrase has no recovery path and the prototype has not had a production security audit.

Other unfinished integrations include IPFS/Arweave storage, durable encrypted assessment storage, authenticated/auditable reviewer accounts, news retrieval/RAG, scanned-document OCR, oracle transaction retry/idempotency, and production monitoring. These require architecture and threat-model decisions before implementation.

For a local frontend configuration, use `VITE_CONTRACT_ADDRESS` when an explicit address is needed. The frontend reads its API URL from `VITE_BACKEND_URL`; see [docs/ENVIRONMENT_AND_SECRETS.md](./docs/ENVIRONMENT_AND_SECRETS.md).
