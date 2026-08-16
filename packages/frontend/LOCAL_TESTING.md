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

The private key above is a public Hardhat development key. Use it only with the local chain. Never use it on Base Sepolia or mainnet.

### 4. Start the frontend

```bash
cd /home/ubuntu/ghost-protocol-frontend
pnpm install
pnpm dev
```

The live preview is already bound to the temporary backend URL used for this test session. For a fully local run, set the backend URL before starting Vite:

```bash
export VITE_BACKEND_URL=http://localhost:4000
pnpm dev
```

The contract address is returned by the backend configuration endpoint, so the frontend does not need a second hard-coded address for read operations.

## Configure a local browser wallet

In MetaMask or another browser wallet, add a custom network with RPC URL `http://127.0.0.1:8545` and chain ID `31337`. Import a Hardhat development account from the `npm run node` terminal output. Use a test account only; the keys printed by Hardhat are public and unsafe on real networks.

## Test the user flow

Open **New vault**, select a small synthetic text file, choose `1 hour / local test` for both the check-in interval and grace period, then click **Create vault**. The browser encrypts the file, calculates the payload and key commitments, and asks the wallet to sign `createVault`.

After the transaction confirms, the app routes to the vault detail page. Click **Send heartbeat** and confirm the wallet transaction. The detail page should update the last heartbeat and keep the vault in `Active` state. **Cancel vault** is also wired to the contract and requires a second confirmation in the browser.

The current create flow uses a `local://` demo CID because IPFS credentials and production key custody are not configured yet. Do not use real evidence. The browser-held key is a prototype seam, not a production recovery system.

## Test backend-driven trigger behavior

The backend API can scan and relay expired vaults:

```bash
curl -X POST http://localhost:4000/api/v1/oracle/scan \
  -H 'content-type: application/json' \
  -d '{"execute": false}'
```

For a controlled local expiry test, use the contract package’s integration flow or advance time through a local-only script. The frontend intentionally does not expose an emergency trigger button because that action belongs to the oracle policy, not the user interface.

## Known prototype boundaries

The frontend is fully wired to the current contract and backend API, but IPFS upload, persistent key custody, and AI evidence verification remain separate next integrations. The UI labels these boundaries explicitly rather than pretending that the testnet prototype is a production release system.
