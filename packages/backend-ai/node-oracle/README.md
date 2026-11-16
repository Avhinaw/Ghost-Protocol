# Ghost Protocol Node Oracle Backend

This package is the backend bridge between the frontend, `GhostProtocol.sol`, and the Python evidence assessor. It provides read-only vault APIs, timeout relaying, and an explicitly reviewed emergency-trigger flow.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Check service, chain, contract, and oracle status. |
| `GET` | `/api/v1/config` | Return chain ID and contract address for frontend configuration. |
| `GET` | `/api/v1/vaults` | List all vaults with JSON-safe string timestamps and IDs. |
| `GET` | `/api/v1/vaults/:vaultId` | Read one vault. |
| `POST` | `/api/v1/uploads` | Stage a client-encrypted file after verifying its SHA-256 proof manifest and owner signature. |
| `POST` | `/api/v1/uploads/:uploadId/anchor` | Verify the mined `VaultCreated` transaction and attach the staged record to its vault. |
| `GET` | `/api/v1/vaults/:vaultId/proof` | Recompute stored-file hashes and compare the proof to chain; requires a signed owner request and a `Triggered` or `Released` vault. |
| `GET` | `/api/v1/vaults/:vaultId/file` | Return encrypted bytes and the wrapped AES key only after on-chain `Released` state and an owner signature. The browser decrypts and rechecks the plaintext SHA-256. |
| `POST` | `/api/v1/oracle/scan` | Find expired active vaults. `{ "execute": true }` also relays timeout triggers. |
| `POST` | `/api/v1/oracle/vaults/:vaultId/trigger` | Relay an eligible timeout trigger. Evidence hashes are rejected; emergency triggers must use the reviewed-assessment route. |
| `POST` | `/api/v1/ai/verify-text` | Store a structured AI assessment. It always requires human review and never allows automatic release. |
| `POST` | `/api/v1/ai/verify-document` | Submit one document to the Python verifier and store its structured assessment. |
| `POST` | `/api/v1/oracle/vaults/:vaultId/ai-reviewed-trigger` | Relay an emergency trigger only after a stored assessment, reviewer identity, explicit approval, and server-side reviewer token are validated. |

The frontend should use the user’s wallet to call user-owned contract functions such as `createVault`, `sendHeartbeat`, `cancelVault`, and `releaseVaultWithProof`. The backend never holds user wallet keys and never receives plaintext document bytes or an unwrapped AES key.

## Proof-gated document flow

1. The browser creates an AES-256-GCM key, encrypts the original binary file and its filename/MIME metadata using separate random IVs, derives a wrapping key from the recipient passphrase using Argon2id (64 MiB, 3 iterations), and AES-GCM-wraps the file key. The versioned `GPK1` package contains only KDF salt, wrapping IV, and encrypted file key.
2. The browser computes SHA-256 of the plaintext, file ciphertext, and metadata ciphertext. The canonical `ghost-vault-proof-v2` manifest commits to all three digests, both encryption IVs, and `keccak256(wrapped AES key)`.
3. The browser signs the staged-upload metadata and uploads only ciphertext, encrypted metadata, IVs, and the wrapped key to MongoDB. The original filename and MIME type are not sent as multipart metadata. The record remains `PENDING_ANCHOR` and expires after 24 hours unless anchored.
4. The owner creates the on-chain vault with the manifest hash and `mongo://<uploadId>` CID. The backend verifies the mined receipt, `VaultCreated` event, owner, hash, CID, and key commitment before marking the record `ANCHORED`.
5. After the contract reaches `Triggered`, the owner signs a proof-preflight request. The backend recomputes all stored hashes and compares them with the vault. The owner then calls `releaseVaultWithProof(vaultId, proofHash)`.
6. Only after the chain reports `Released` does the backend return the encrypted record. The browser unwraps and decrypts it, then verifies the plaintext SHA-256 before saving it.

The passphrase is entered only in the browser and is never persisted or sent to the backend. A forgotten passphrase makes the document unrecoverable. Because a stolen wrapped key can be tested offline, use a long, unique passphrase; Argon2id increases the cost but cannot compensate for a weak phrase. No reset, recovery, or recipient handoff is implemented. Do not use real or irreplaceable files.

**The updated contract is not compatible with the earlier deployed contract**, which stored a raw release key and used a different vault tuple. Deploy the updated `GhostProtocol` to Base Sepolia and point both Render `CONTRACT_ADDRESS` and the frontend build's `VITE_CONTRACT_ADDRESS` at the new deployment before testing. Existing vaults on the old address cannot be migrated automatically.

## Local setup

Install dependencies:

```bash
cd packages/backend-ai/node-oracle
npm install
```

Copy `.env.example` to `.env` and set `CONTRACT_ADDRESS` to the updated deployment. For local development, configure `RPC_URL`, `CONTRACT_ADDRESS`, and `CORS_ORIGIN` for your local Hardhat stack. For any public testnet, configure `ORACLE_PRIVATE_KEY` only as a secret and use a dedicated authorized testnet oracle wallet; never use Hardhat keys on a public network.

On Render, the API binds to `0.0.0.0` and uses the platform-provided `PORT`. Do not pin `PORT=4000` in Render; keep port `4000` for local development only.

Set `MONGODB_URI` in Render's secret environment settings and optionally set `MONGODB_DATABASE` (defaults to `ghost_protocol`). The backend stores wallet addresses derived from owner signatures and pending/anchored encrypted-file records in MongoDB. MongoDB storage is disabled when `MONGODB_URI` is unset.

Mongo collections:

- `wallets`: normalized wallet address and first/last-seen timestamps.
- `vault_files`: upload state, chain/contract/vault IDs, owner wallet, proof hashes, encrypted file and encrypted filename/MIME metadata, IVs, wrapped key, and anchor transaction metadata. Original filenames and MIME types are encrypted; unanchored records expire after 24 hours.

The unwrapped AES key and plaintext are never stored. MongoDB should use an access-restricted account, TLS, backups, and appropriate at-rest encryption. The current design still places encrypted files and metadata with the API operator and does not provide key recovery.

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

The script deploys a fresh contract, starts the API in-process, creates a vault from a local user wallet, reads it through the API, advances local time, and uses the API to relay the eligible timeout trigger.

The current worker defaults to `ORACLE_AUTO_TRIGGER=false` so a background scan cannot accidentally send irreversible transactions. Enable automatic timeout relaying only after the contract, oracle wallet, retry policy, and evidence rules have been reviewed.

## AI evidence-review gate

The Python verifier is a recommendation layer, not a blockchain actor. Start it in a separate terminal with deterministic local mode:

```bash
cd ../python-rag
sudo pip3 install -r requirements.txt
AI_MODE=mock uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Set `AI_VERIFIER_URL=http://127.0.0.1:8000` and `REVIEWER_APPROVAL_TOKEN` in the Node oracle environment. Then run the safeguarded end-to-end local flow after the Hardhat node and mock verifier are active:

```bash
REVIEWER_APPROVAL_TOKEN=local-review-token-123456 npm run ai:local-flow
```

The guarded route validates the stored assessment, its expiry and decision, explicit reviewer identity and approval, and the server-side token. The legacy trigger endpoint rejects evidence-hash requests so it cannot bypass this gate. Do not use real documents or the local reviewer token outside development.
