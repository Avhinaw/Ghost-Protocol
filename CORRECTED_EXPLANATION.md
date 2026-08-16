# Ghost Protocol — Corrected Plain-Language Explanation

## What this project really is

**Ghost Protocol is an autonomous, decentralized “dead man’s switch” for releasing encrypted evidence.** It is designed for people such as whistleblowers, investigative journalists, or other high-risk users who want evidence to become public if they stop checking in or if a verified emergency event occurs.[1]

It is called a dead man’s switch because the system expects the owner to regularly prove that they are safe by sending a blockchain heartbeat. If the heartbeat stops for longer than the configured interval plus grace period, the system can trigger the release process. An authorized oracle can also trigger the process when an external event, such as a verified arrest, disappearance, or death certificate, meets the project’s rules.[1] [2]

This is **not** a death detector that decides by itself that someone has died. The blockchain enforces the timing and permissions. The AI is an off-chain verification assistant that evaluates news and official documents. The smart contract is the part that should enforce the final state transition.

## The simple example

A user has a sensitive video or document.

1. The user selects the file in the browser.
2. The browser encrypts it locally using AES-256-GCM. The plaintext should never be uploaded.
3. The encrypted file is pinned to IPFS or Arweave.
4. The user creates a vault on the blockchain and stores the encrypted file’s CID and integrity hash in the contract.
5. The user chooses a heartbeat interval, such as seven days, and a grace period, such as forty-eight hours.
6. The user sends a heartbeat periodically from their wallet.
7. If the user keeps checking in, the vault stays active.
8. If the user misses the deadline, an oracle worker can call the expiration-trigger function.
9. If the AI/oracle service validates an emergency document or event, the authorized oracle can call the emergency-trigger function.
10. After the contract releases the decryption material, recipients can retrieve the encrypted payload from decentralized storage and decrypt it according to the release design.

The official architecture describes the state flow as **Active → Triggered → Released**, with cancellation available from the active state.[2]

## What each part does

| Part | Plain meaning | Responsibility |
|---|---|---|
| **Frontend** | The website the user interacts with | Connect wallet, encrypt files locally, upload encrypted files, create vaults, show countdowns, and send heartbeats. |
| **Smart contract** | The automatic blockchain rulebook | Store vault metadata, heartbeat timestamps, state, hashes, oracle authorization, and release information. Enforce time-lock and state transitions. |
| **IPFS/Arweave** | Decentralized storage | Store the encrypted evidence. It should never receive the original plaintext file. |
| **Node.js oracle worker** | The blockchain automation service | Check expired vaults, listen for blockchain events, poll the AI service, and submit authorized trigger transactions. |
| **Python AI service** | The document/news verification service | Analyze submitted official documents and news context; return structured results and confidence scores. |
| **Recipients/public** | The people who receive the evidence | See the released vault and retrieve the encrypted payload and released decryption material. |

The repository assigns the frontend to Next.js, wallet connectivity to Wagmi/Viem/RainbowKit, the contract to Solidity/Hardhat, the oracle worker to Node.js/Ethers.js, and the AI service to Python/FastAPI/LangChain/OpenAI/FAISS.[1] [3] [4] [5]

## Where AI fits—and where it does not

AI does **not** replace the blockchain contract. AI should not be allowed to directly publish evidence or change a vault without contract authorization.

The planned AI service has one explicitly documented endpoint, `POST /v1/verify-document`. It accepts an official PDF such as a death certificate, police report, or court order and returns a structured result containing document validity, type, subject name, registration hash, confidence score, and a summary.[6]

The broader project documentation also describes a news-retrieval system using news feeds, scraping, LangChain, and a FAISS vector store to look for context such as “missing,” “detained,” or “deceased.”[1] However, the AI specification is currently only a short stub: it does not define the news endpoint, source allowlist, identity-matching rules, threshold policy, human review policy, or anti-false-positive process.[6]

## What is actually in the repository today

The correct `Avhinaw/Ghost-Protocol` repository is currently **mostly an architecture blueprint and scaffold, not a finished application**. The repository contains the README, six specification documents, a `.gitignore`, a license, and a minimal Hardhat configuration/package manifest. The tracked repository currently contains **zero Solidity files, zero Python files, and no frontend implementation**; the contract package’s test command is still a placeholder that exits with an error.[7] [8]

| Area | Intended by the documents | Present in the repository now |
|---|---|---|
| Smart contract | `packages/contracts/contracts/GhostProtocol.sol`, interface, deployment script, and tests | Not present; only Hardhat configuration and package metadata exist. |
| Frontend | Next.js routes `/`, `/dashboard`, `/create`, and `/vault/[id]`; browser encryption and wallet UI | Not present. |
| Node oracle | Six-hour expiration cron, event listener, Python-service polling, and transaction relayer | Not present. |
| Python AI | FastAPI document-verification service and RAG/news engine | Not present; only the short specification exists. |
| Secrets/configuration | RPC, oracle wallet, contract address, Pinata, AI service URL, and OpenAI variables | A template specification exists; real secrets and production values must still be configured securely. |

So the correct status is: **the idea and architecture are documented, but the actual death-switcher still needs to be built.**

## What we need to build next

The safest build order is:

1. **Define the threat model and release policy.** Decide exactly what counts as an emergency, who may submit evidence, whether release is automatic or requires multiple confirmations, what happens after a false alarm, and whether the owner can cancel or recover a vault.
2. **Build and test the smart contract first.** Implement vault creation, encrypted-payload metadata, heartbeat, expiration checks, cancellation, oracle authorization, trigger states, release rules, events, and access control. Add comprehensive unit and adversarial tests before using a testnet.
3. **Build the browser encryption flow.** Encrypt files locally, generate a random key and IV, upload ciphertext only, compute the integrity hash, and create the vault transaction. The key-management design must be finalized before implementation; storing a plaintext decryption key in a public contract would defeat the security model.
4. **Build the user dashboard.** Add wallet connection, vault creation, countdown/status display, heartbeat, cancellation, and public vault/release views.
5. **Build the oracle worker.** Add a read-only expiration scanner, event listener, retry and idempotency logic, transaction simulation, gas management, and a tightly restricted oracle wallet. A six-hour cron is only a proposed interval, not proof that the system is reliable.
6. **Build the AI verification service.** Start with document parsing and structured outputs, then add source-controlled news retrieval. Require evidence provenance, identity matching, confidence thresholds, duplicate detection, and a safe decision policy. AI should recommend or attest to a condition; the contract should enforce only a clearly defined oracle authorization policy.
7. **Integrate only on a local chain first.** Run contract tests, frontend tests, oracle tests, and AI fixture tests locally. Then deploy to Base Sepolia, use synthetic test documents/news, and perform controlled end-to-end trigger tests.
8. **Perform security review before any real evidence is uploaded.** Focus on key custody, oracle compromise, false positives, wallet recovery, IPFS persistence, malicious documents, prompt injection from news/PDFs, denial of service, replayed triggers, and privacy leaks.

## The actual end-to-end flow we should implement

```text
User browser
  ├─ encrypt evidence locally
  ├─ upload ciphertext to IPFS/Arweave
  ├─ calculate CID/hash
  └─ create vault on GhostProtocol.sol

User wallet
  └─ send heartbeat before deadline

Node oracle worker
  ├─ watch VaultCreated and HeartbeatReceived events
  ├─ scan active vaults for expired heartbeat + grace period
  ├─ ask Python AI service to verify emergency evidence
  ├─ check oracle policy and confidence thresholds
  └─ submit an authorized blockchain trigger transaction

GhostProtocol.sol
  ├─ verify caller permissions and current state
  ├─ move Active → Triggered
  ├─ enforce release delay or confirmation policy
  └─ move Triggered → Released or Cancelled according to the rules

Public/recipients
  ├─ read released vault state
  ├─ retrieve encrypted ciphertext from IPFS/Arweave
  └─ decrypt only when the release mechanism authorizes it
```

## The most important correction

The previous explanation I gave you described an unrelated “AI software-team workflow” repository. That was my mistake. **Your Ghost Protocol is a blockchain evidence-release dead man’s switch.** The correct repository describes the product above, but it is not finished yet. Our next work should be actual implementation of the contract, encryption/key-release design, frontend, oracle worker, and AI verification service—not a team-agent workflow.

## References

[1]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/README.md "Ghost Protocol README"
[2]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/docs/MASTER_SYSTEM_SPEC.md "Ghost Protocol master system specification"
[3]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/docs/FRONTEND_SPEC.md "Ghost Protocol frontend specification"
[4]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/docs/BACKEND_ORACLE_SPEC.md "Ghost Protocol backend oracle specification"
[5]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/docs/ENVIRONMENT_AND_SECRETS.md "Ghost Protocol environment and secrets specification"
[6]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/docs/AI_ENGINE_SPEC.md "Ghost Protocol AI engine specification"
[7]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/packages/contracts/package.json "Ghost Protocol contract package manifest"
[8]: https://github.com/Avhinaw/Ghost-Protocol/blob/main/packages/contracts/hardhat.config.ts "Ghost Protocol Hardhat configuration"
