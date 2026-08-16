# Local Reviewer Console Test Guide

This console is a **local-only prototype**. It is intentionally restricted to `localhost` services, uses the development reviewer token, and must be used with synthetic material only.

## Start the local services

Open four terminals.

```bash
# 1. Local chain
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/contracts
npm run node
```

```bash
# 2. Deploy a local contract and copy the printed address
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/contracts
npm run deploy:local
```

```bash
# 3. Synthetic AI verifier
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/backend-ai/python-rag
AI_MODE=mock uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# 4. Local Node oracle
cd /home/ubuntu/Avhinaw-Ghost-Protocol/packages/backend-ai/node-oracle
RPC_URL=http://127.0.0.1:8545 \
CONTRACT_ADDRESS=<PASTE_LOCAL_CONTRACT_ADDRESS> \
ORACLE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
PORT=4000 \
CORS_ORIGIN='*' \
AI_VERIFIER_URL=http://127.0.0.1:8000 \
REVIEWER_APPROVAL_TOKEN=local-review-token-123456 \
npm run start
```

## Use the interface

Open the **development preview** rather than the published portfolio site, then open **Reviewer Console** from the shield icon on the right rail. Select **Enter local reviewer mode**. Use a synthetic `.txt` file that contains official document markers such as `OFFICIAL DEATH CERTIFICATE`, a `Subject`, a `Certificate Number`, and `Issued by the Registrar`.

Enter the target local vault ID, upload the document, then inspect the assessment. Confirm the checkbox and select **Approve & trigger vault**. This sends the reviewer token from the protected server to the local oracle; it is never included in frontend JavaScript.

After the vault is `Triggered`, connect MetaMask to local chain `31337` and submit the exact test release key that was committed when the vault was created. The console now fills the connected local contract address automatically. A matching key changes the state to `Released` and shows a **Released locally** confirmation.

## Local browser-wallet setup

Use a temporary browser profile and a local-only MetaMask account. Add a network named **Ghost Protocol Local** with RPC URL `http://127.0.0.1:8545`, chain ID `31337`, and currency symbol `ETH`. Import only the Hardhat test account `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`; this is the local vault-owner account used by the test scripts and must never be used on a public network.

The full browser UI smoke test creates a synthetic vault, signs in locally, uploads synthetic evidence, verifies reject/no-oracle feedback, approves the assessment, injects a local-only wallet shim, submits the matching release key, and asserts the visible release confirmation. It is intended for the sandbox only:

```bash
# With the local chain, verifier, oracle, and development server running:
chromium --headless=new --no-sandbox --remote-debugging-port=9222 --user-data-dir=/tmp/ghost-reviewer-smoke about:blank
cd /home/ubuntu/ghost-protocol-frontend
pnpm test:reviewer-ui
```

The published portfolio site intentionally disables this interaction because it cannot and should not reach sandbox-local services.

## Safety limitations

Do not use real documents, keys, personal wallets, or the local reviewer token outside this test. The local chain is resettable, the approval registry is temporary, and the release-key model is prototype-only.
