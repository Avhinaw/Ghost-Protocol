# Ghost Protocol Frontend / Local Testing

The frontend is a static client. It does not hold the oracle private key. The browser wallet signs user actions; the backend reads the contract and relays oracle actions.

## Start the local stack

### 1. Local chain

```bash
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/contracts
npm run node
```

### 2. Deploy the contract

In a second terminal:

```bash
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/contracts
npm run deploy:local
```

Copy the printed contract address.

### 3. Start the backend

```bash
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/backend-ai/node-oracle
CONTRACT_ADDRESS=<printed-address> \
ORACLE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
PORT=4000 CORS_ORIGIN=http://localhost:3000 \
npm start
```

The private key above is a public Hardhat development key. Use it only with the local chain. Never use it on Base Sepolia or mainnet. Set `MONGODB_URI` in this terminal if you want to test the document upload flow; use a local/test database secret, not a credential pasted in chat.

### 4. Start the frontend

```bash
cd /home/ubuntu/ghost-protocol-frontend
export JWT_SECRET=<random-local-session-secret>
export VITE_BACKEND_URL=http://localhost:4000
pnpm install
pnpm dev
```

`JWT_SECRET` is required by the local reviewer sign-in and must be kept server-side. For PowerShell, set it before startup with `$env:JWT_SECRET = '<random-local-session-secret>'`; set `VITE_BACKEND_URL` similarly.

For a fully local run, set the backend URL before starting Vite:

```bash
export VITE_BACKEND_URL=http://localhost:4000
pnpm dev
```

The contract address is returned by the backend configuration endpoint, so the frontend does not need a second hard-coded address for read operations.

## Configure a local browser wallet

In MetaMask or another browser wallet, add a custom network with RPC URL `http://127.0.0.1:8545` and chain ID `31337`. Import a Hardhat development account from the `npm run node` terminal output. Use a test account only; the keys printed by Hardhat are public and unsafe on real networks.

## Test the user flow

Open **New vault**, select a small synthetic binary or text file, choose `1 hour / local test` for both the check-in interval and grace period, then click **Commit vault**. The browser encrypts the file and filename/MIME metadata, computes the SHA-256 proof manifest, stages ciphertext in MongoDB, and asks the wallet to create a vault containing the proof hash and upload ID. The backend then verifies the mined `VaultCreated` event and marks the MongoDB record anchored.

After the transaction and anchor step complete, the app routes to the vault detail page. Click **Send heartbeat** and confirm the wallet transaction. The detail page should update the last heartbeat and keep the vault in `Active` state. **Cancel vault** is also wired to the contract and requires a second confirmation in the browser. After the vault is `Triggered`, use **Verify proof, release & download**: the API rehashes the stored ciphertext, the owner signs the request and calls `releaseVaultWithProof`, and the browser decrypts only after the chain reaches `Released` and verifies the plaintext SHA-256.

The CID is `mongo://<uploadId>`; file bytes and filename/MIME metadata remain encrypted in MongoDB, not on-chain. The AES key is wrapped under an Argon2id-derived key from the passphrase entered at creation. Re-enter that passphrase after the vault is triggered; it is never sent to the backend or stored by the app. A forgotten passphrase cannot be recovered, and a weak passphrase may be guessed offline if MongoDB is stolen. Do not use real evidence.

## Test backend-driven trigger behavior

The backend API can scan and relay expired vaults:

```bash
curl -X POST http://localhost:4000/api/v1/oracle/scan \
  -H 'content-type: application/json' \
  -d '{"execute": false}'
```

For a controlled local expiry test, use the contract package’s integration flow or advance time through a local-only script. The frontend intentionally does not expose an emergency trigger button because that action belongs to the oracle policy, not the user interface.

## Known prototype boundaries

The frontend is connected to the contract and backend API, and the reviewer console uses the Python verifier through the Node service. File storage is MongoDB-backed; the passphrase is user-held and not backed up. Assessments are stored in memory and require the local prototype reviewer gate. The UI labels these boundaries explicitly rather than presenting the prototype as production-ready.
