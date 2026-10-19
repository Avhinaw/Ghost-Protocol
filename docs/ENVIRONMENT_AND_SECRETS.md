# Environment and secrets

Configure each service from its own package working directory. Do not commit `.env` files or real credentials. The contract, oracle, reviewer, and AI settings below are for local development unless explicitly described otherwise.

## Node oracle (`packages/backend-ai/node-oracle`)

| Variable | Purpose | Default / requirement |
|---|---|---|
| `RPC_URL` | EVM JSON-RPC endpoint | `http://127.0.0.1:8545` |
| `CONTRACT_ADDRESS` | Deployed GhostProtocol address | Required to start the server |
| `ORACLE_PRIVATE_KEY` | Oracle signer | Optional; required for relaying |
| `PORT` | HTTP listen port | `4000` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:3000` |
| `ORACLE_SCAN_INTERVAL_MS` | Worker polling interval | `21600000` (six hours) |
| `ORACLE_AUTO_TRIGGER` | Automatically relay expired-vault triggers | `false` |
| `AI_VERIFIER_URL` | Python verifier base URL | Optional; AI endpoints disabled if absent |
| `AI_ASSESSMENT_TTL_MS` | In-memory assessment lifetime | `900000` (15 minutes) |
| `REVIEWER_APPROVAL_TOKEN` | Prototype reviewer gate | Optional; use a random local-only value of at least 16 characters |

## Python verifier (`packages/backend-ai/python-rag`)

| Variable | Purpose | Default / requirement |
|---|---|---|
| `AI_MODE` | `mock` or `live` assessment | `mock` |
| `AI_MODEL` | Live model identifier | `gemini-3-flash-preview` |
| `AI_REVIEW_MIN_CONFIDENCE` | Minimum confidence to recommend human review | `0.80` |
| `OPENAI_API_KEY` | OpenAI-compatible service credential | Required in `live` mode |
| `OPENAI_API_BASE` | OpenAI-compatible service base URL | Required for the configured Gemini proxy |

Never place AI credentials, reviewer tokens, or oracle keys in frontend `VITE_` variables. A variable embedded in a browser build is public.

## Frontend (`packages/frontend`)

| Variable | Purpose |
|---|---|
| `VITE_BACKEND_URL` | Node oracle HTTP API base URL; set to `http://127.0.0.1:4000` for local work |
| `VITE_CONTRACT_ADDRESS` | Optional contract address fallback |
| `VITE_CHAIN_ID` | Expected EVM chain ID; defaults to `31337` |
| `JWT_SECRET` | Server-side session signing secret; set a random local value to enable the development reviewer session |

Other frontend framework variables are unrelated to blockchain credentials and depend on the local app environment. Never store wallet private keys in frontend environment variables.

## Local-only keys

Hardhat prints well-known development private keys when the local chain starts. Those keys are public and must only be used against the local Hardhat chain. Do not fund or reuse them on any public network. For testnet deployment, use separate wallets and a secrets manager; never paste credentials into chat.
