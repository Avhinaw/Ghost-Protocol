# 💻 Specification 02: Next.js Frontend & WebCrypto Engine

**Target Sub-Package:** `packages/frontend`  
**Primary Framework:** Next.js 14 App Router  

---

## 1. Application Routes

| Route Path | View / Purpose |
| :--- | :--- |
| `/` | Landing page, protocol overview, features. |
| `/dashboard` | Active user vaults, timer progress bars, one-click heartbeat triggers. |
| `/create` | File selection, browser AES-256 encryption, IPFS pinning, Web3 creation transaction. |
| `/vault/[id]` | Public payload view. Shows vault status and reveals decryption controls if unlocked. |

---

## 2. Client-Side Encryption Protocol (`lib/crypto/index.ts`)

Files are encrypted using standard WebCrypto APIs available in modern browsers:

1. **Algorithm:** `AES-256-GCM`
2. **Key Generation:** Generate a random 256-bit symmetric key (`crypto.subtle.generateKey`).
3. **Initialization Vector (IV):** Generate a random 12-byte IV per file (`crypto.getRandomValues`).
4. **Binary Processing:** Convert the raw file into an `ArrayBuffer`, encrypt it, and prepend the IV to the ciphertext array before base64/binary encoding for IPFS.
5. **Key Export:** Export the key as raw bytes / JWK, encrypting it off-chain until the smart contract releases it.

---

## 3. Web3 & Wallet Connectivity

* **Providers:** Wagmi, Viem, RainbowKit.
* **Supported Chains:** Localhost Hardhat (31337), Base Sepolia Testnet (84532), Base Mainnet (8453).
* **State Sync:** TanStack React Query handles real-time updates for `useVault` hooks, polling RPC nodes every 12 seconds.