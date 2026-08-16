# Ghost Protocol AI Integration

## Purpose and safety boundary

The AI layer examines emergency evidence and returns a **structured recommendation**. It does not own a wallet, call the smart contract, release a key, or decide that a person is dead. An assessment can only become an oracle transaction after the Node service confirms all of the following: the assessment is stored and unexpired, its decision is `HUMAN_REVIEW_REQUIRED`, `auto_release_allowed` is `false`, an identified reviewer supplies `reviewerApproval: true`, and the server-side reviewer token is valid.

The live model is `gemini-3-flash-preview`, selected for multimodal structured-output support. The default development mode is deterministic `mock` mode, which makes local tests repeatable without model calls.

## Components

| Component | Responsibility | Can submit a chain transaction? |
| --- | --- | --- |
| `packages/backend-ai/python-rag` | Extracts document text and returns a strict evidence assessment. | No |
| `packages/backend-ai/node-oracle` | Stores short-lived assessments, enforces reviewer approval, and relays a permitted oracle action. | Yes, only after review gate validation |
| `GhostProtocol.sol` | Records the assessment hash as the oracle evidence hash and changes vault state. | Contract authority only |

## Local test sequence

First start the local chain:

```bash
cd packages/contracts
npm run node
```

In another terminal, start the deterministic verifier:

```bash
cd packages/backend-ai/python-rag
sudo pip3 install -r requirements.txt
AI_MODE=mock uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then execute the full guarded flow:

```bash
cd packages/backend-ai/node-oracle
REVIEWER_APPROVAL_TOKEN=local-review-token-123456 npm run ai:local-flow
```

The script proves a synthetic assessment is stored, an invalid reviewer token is rejected, an explicit review is accepted, and only then does the local vault reach `Triggered`.

## Complete document-to-release test

With the local chain and mock verifier still running, the full test uploads a synthetic text document through the Node gateway, stores its AI assessment, proves that an invalid reviewer token is blocked, records explicit reviewer approval, relays the oracle trigger, and manually supplies the matching committed release key:

```bash
cd packages/backend-ai/node-oracle
REVIEWER_APPROVAL_TOKEN=local-review-token-123456 npm run complete:local-flow
```

The expected final state is `Released`. This verifies the complete prototype lifecycle, not production-grade custody or identity verification.

## Live mode

Set `AI_MODE=live` and run the Python service with `AI_MODEL=gemini-3-flash-preview`. The service requires `OPENAI_API_KEY` and `OPENAI_API_BASE` in its server environment. These values must never be placed in frontend code, a browser environment variable, or a committed `.env` file.

The current document endpoint accepts text-based PDFs and UTF-8 text. Scanned PDFs need an OCR/image pipeline before they can be assessed. Before any real deployment, replace the in-memory assessment registry with durable encrypted storage and replace the single reviewer token with authenticated, auditable multi-reviewer approval.
