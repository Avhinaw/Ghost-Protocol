import { BrowserProvider, Contract, keccak256, type Log } from "ethers";
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "https://ghost-protocol-4dcu.onrender.com").replace(/\/$/, "");
export const FALLBACK_CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS || "0x4B58BEEA180668b0bc80f8B1B6390E08d21003a1";
export const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 84532);
export const GHOST_PROTOCOL_ABI = ["function createVault(bytes32 payloadHash, string payloadCid, bytes32 keyCommitment, uint64 checkInInterval, uint64 gracePeriod) returns (uint256 vaultId)", "function sendHeartbeat(uint256 vaultId)", "function cancelVault(uint256 vaultId)", "function releaseVault(uint256 vaultId, bytes releaseKey)", "event VaultCreated(uint256 indexed vaultId, address indexed owner, bytes32 indexed payloadHash, string payloadCid, uint64 checkInInterval, uint64 gracePeriod)", "function vaultCount() view returns (uint256)"] as const;
export type WalletState = { address: string; chainId: number };
export type ContractConfig = { chainId: string; contractAddress: string; rpcConfigured: boolean };
export type Vault = { id: string; owner: string; payloadHash: string; payloadCid: string; keyCommitment: string; checkInInterval: string; gracePeriod: string; createdAt: string; lastHeartbeat: string; triggeredAt: string; triggerEvidenceHash: string; state: number; stateName: string; releaseKeyAvailable: boolean; deadline: string; expired: boolean };
declare global { interface Window { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }; } }
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${BACKEND_URL}${path}`, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`); return body as T; }
async function walletProvider() { if (!window.ethereum) throw new Error("Install a browser wallet such as MetaMask to continue."); const provider = new BrowserProvider(window.ethereum as never); await provider.send("eth_requestAccounts", []); const network = await provider.getNetwork(); if (Number(network.chainId) !== EXPECTED_CHAIN_ID) throw new Error(`Wrong network. Switch your wallet to chain ${EXPECTED_CHAIN_ID}.`); return provider; }
export async function connectWallet(): Promise<WalletState> { const provider = await walletProvider(); return { address: await (await provider.getSigner()).getAddress(), chainId: Number((await provider.getNetwork()).chainId) }; }
async function contractFor(address: string) { if (!address) throw new Error("No contract address configured. Deploy GhostProtocol and set the frontend contract address."); const provider = await walletProvider(); return new Contract(address, GHOST_PROTOCOL_ABI, await provider.getSigner()); }
export async function createVaultOnChain(address: string, args: { payloadHash: string; payloadCid: string; keyCommitment: string; checkInInterval: number; gracePeriod: number }) { const contract = await contractFor(address); const tx = await contract.createVault(args.payloadHash, args.payloadCid, args.keyCommitment, args.checkInInterval, args.gracePeriod); const receipt = await tx.wait(); let vaultId: string | undefined; for (const log of receipt.logs as readonly Log[]) { try { const event = contract.interface.parseLog(log); if (event?.name === "VaultCreated") { vaultId = BigInt(event.args.vaultId).toString(); break; } } catch { /* Ignore logs emitted by unrelated contracts. */ } } if (!vaultId) throw new Error("Vault creation transaction confirmed, but its VaultCreated event was not found."); return { hash: receipt.hash, vaultId }; }
export async function sendHeartbeatOnChain(address: string, vaultId: string) { const contract = await contractFor(address); return (await contract.sendHeartbeat(BigInt(vaultId))).wait(); }
export async function cancelVaultOnChain(address: string, vaultId: string) { const contract = await contractFor(address); return (await contract.cancelVault(BigInt(vaultId))).wait(); }
export async function releaseVaultOnChain(address: string, vaultId: string, releaseKey: Uint8Array) { const contract = await contractFor(address); return (await contract.releaseVault(BigInt(vaultId), releaseKey)).wait(); }
function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}
export async function prepareEncryptedEvidence(file: File) { const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12)); const plaintext = await file.arrayBuffer(); const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext); const encryptedData = new Uint8Array(ciphertext); const payloadHash = keccak256(encryptedData); const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key)); return { payloadHash, keyCommitment: keccak256(rawKey), payloadCid: `mongo://${payloadHash.slice(2).toLowerCase()}`, iv: toBase64(iv), encryptedData }; }
export async function storeEncryptedVaultFile(input: { contractAddress: string; vaultId: string; payloadHash: string; iv: string; encryptedData: Uint8Array; file: File }) {
  const provider = await walletProvider();
  const signer = await provider.getSigner();
  const chainId = (await provider.getNetwork()).chainId.toString();
  const contentType = input.file.type.slice(0, 160) || "application/octet-stream";
  const message = [
    "Ghost Protocol encrypted vault file",
    "action: upload",
    `chainId: ${chainId}`,
    `contractAddress: ${input.contractAddress.toLowerCase()}`,
    `vaultId: ${input.vaultId}`,
    `payloadHash: ${input.payloadHash.toLowerCase()}`,
    `fileName: ${input.file.name}`,
    `iv: ${input.iv}`,
    `contentType: ${contentType}`,
  ].join("\n");
  const signature = await signer.signMessage(message);
  const form = new FormData();
  const encryptedBuffer = input.encryptedData.slice().buffer as ArrayBuffer;
  form.append("file", new Blob([encryptedBuffer]), input.file.name);
  form.append("iv", input.iv);
  form.append("contentType", contentType);
  form.append("signature", signature);
  return fetchJson<{ vaultId: string; ownerAddress: string; fileName: string; payloadHash: string; stored: boolean }>(
    `/api/v1/vaults/${input.vaultId}/file`,
    { method: "POST", body: form },
  );
}
