# Ghost Protocol Node Oracle Backend

This package is the backend bridge between the future frontend and `GhostProtocol.sol`. It provides read-only vault APIs for the frontend and a guarded oracle relay for timeout and emergency-trigger transactions.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Check service, chain, contract, and oracle status. |
| `GET` | `/api/v1/config` | Return chain ID and contract address for frontend configuration. |
| `GET` | `/api/v1/vaults` | List all vaults with JSON-safe string timestamps and IDs. |
| `GET` | `/api/v1/vaults/:vaultId` | Read one vault. |
| `POST` | `/api/v1/oracle/scan` | Find expired active vaults. `{ "execute": true }` also relays timeout triggers. |
| `POST` | `/api/v1/oracle/vaults/:vaultId/trigger` | Relay a timeout trigger with an empty body, or an emergency oracle trigger with `{ "evidenceHash": "0x..." }`. |

The frontend should use the user’s wallet to call user-owned contract functions such as `createVault`, `sendHeartbeat`, and `cancelVault`. The backend should not hold user wallet keys and should not expose raw release keys through an HTTP endpoint.

## Local setup

Install dependencies:

```bash
cd packages/backend-ai/node-oracle
npm install
```

Copy `.env.example` to `.env` and set `CONTRACT_ADDRESS` after deploying the contract. For local development, the backend can use the known Hardhat deployer key as a test-only oracle key, but never use Hardhat keys on a public network.

Start the local chain in one terminal:

```bash
cd packages/contracts
npm run node
```

Run the backend API in another terminal after setting `CONTRACT_ADDRESS`:

```bash
cd packages/backend-ai/node-oracle
npm run start
```

Check it:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1/config
curl http://localhost:4000/api/v1/vaults
```

## Automated checks

```bash
npm run test
npx tsc --noEmit
```

## Backend-to-contract integration flow

With `npm run node` running in `packages/contracts`, run:

```bash
cd packages/backend-ai/node-oracle
npm run local:flow
```

The script deploys a fresh contract, starts the API in-process, creates a vault from a local user wallet, reads it through the API, advances local time, uses the API to relay the expiration trigger, creates a second vault, uses the API to relay an evidence-based oracle trigger, and confirms both vaults are `Triggered`.

The current worker defaults to `ORACLE_AUTO_TRIGGER=false` so a background scan cannot accidentally send irreversible transactions. Enable automatic timeout relaying only after the contract, oracle wallet, retry policy, and evidence rules have been reviewed.
