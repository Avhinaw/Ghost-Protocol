import { BrowserProvider, Contract, type Log } from "ethers";
import {
  base64ToUint8Array,
  decryptReleasedVaultFile,
  prepareEncryptedEvidence as prepareFile,
  type PreparedVaultFile,
  type ReleasedVaultFile,
  uint8ArrayToBase64,
} from "./vault-crypto";

export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "https://ghost-protocol-4dcu.onrender.com").replace(/\/$/, "");
export const BASE_SEPOLIA_CONTRACT_ADDRESS = "0xf4d8f1092b07422DD4F3BFC98882E18be51185AF";
export const FALLBACK_CONTRACT = BASE_SEPOLIA_CONTRACT_ADDRESS;
export const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 84532);
export const GHOST_PROTOCOL_ABI = [
  "function createVault(bytes32 payloadHash, string payloadCid, bytes32 keyCommitment, uint64 checkInInterval, uint64 gracePeriod) returns (uint256 vaultId)",
  "function sendHeartbeat(uint256 vaultId)",
  "function cancelVault(uint256 vaultId)",
  "function checkAndTriggerExpired(uint256 vaultId)",
  "function releaseVaultWithProof(uint256 vaultId, bytes32 proofHash)",
  "event VaultCreated(uint256 indexed vaultId, address indexed owner, bytes32 indexed payloadHash, string payloadCid, uint64 checkInInterval, uint64 gracePeriod)",
  "function vaultCount() view returns (uint256)",
] as const;

export type WalletState = { address: string; chainId: number };
export type ContractConfig = { chainId: string; contractAddress: string; rpcConfigured: boolean };
export type Vault = {
  id: string;
  owner: string;
  payloadHash: string;
  payloadCid: string;
  keyCommitment: string;
  checkInInterval: string;
  gracePeriod: string;
  createdAt: string;
  lastHeartbeat: string;
  triggeredAt: string;
  triggerEvidenceHash: string;
  state: number;
  stateName: string;
  documentReleased: boolean;
  deadline: string;
  expired: boolean;
};

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

async function walletProvider() {
  if (!window.ethereum) throw new Error("Install a browser wallet such as MetaMask to continue.");
  const provider = new BrowserProvider(window.ethereum as never);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
    throw new Error(`Wrong network. Switch your wallet to chain ${EXPECTED_CHAIN_ID}.`);
  }
  return provider;
}

async function contractFor(address: string) {
  if (!address) throw new Error("No contract address configured. Deploy GhostProtocol and set the frontend contract address.");
  const provider = await walletProvider();
  return new Contract(address, GHOST_PROTOCOL_ABI, await provider.getSigner());
}

export async function connectWallet(): Promise<WalletState> {
  const provider = await walletProvider();
  return {
    address: await (await provider.getSigner()).getAddress(),
    chainId: Number((await provider.getNetwork()).chainId),
  };
}

export async function prepareEncryptedEvidence(file: File, passphrase: string): Promise<PreparedVaultFile> {
  const provider = await walletProvider();
  const ownerAddress = await (await provider.getSigner()).getAddress();
  return prepareFile(file, ownerAddress, passphrase);
}

export async function stageEncryptedVaultFile(input: {
  contractAddress: string;
  evidence: PreparedVaultFile;
}): Promise<{ uploadId: string; ownerAddress: string; proofHash: string; status: string }> {
  const provider = await walletProvider();
  const signer = await provider.getSigner();
  const ownerAddress = await signer.getAddress();
  if (ownerAddress.toLowerCase() !== input.evidence.ownerAddress.toLowerCase()) {
    throw new Error("Connected wallet changed after file encryption. Re-select the file to create a new proof.");
  }
  const chainId = (await provider.getNetwork()).chainId.toString();
  const message = [
    "Ghost Protocol staged encrypted file",
    `chainId: ${chainId}`,
    `contractAddress: ${input.contractAddress.toLowerCase()}`,
    `uploadId: ${input.evidence.uploadId}`,
    `proofHash: ${input.evidence.proofHash.toLowerCase()}`,
    `keyCommitment: ${input.evidence.keyCommitment.toLowerCase()}`,
  ].join("\n");
  const signature = await signer.signMessage(message);
  const form = new FormData();
  form.append("file", new Blob([input.evidence.encryptedData.slice().buffer as ArrayBuffer]), "encrypted-payload.bin");
  form.append("uploadId", input.evidence.uploadId);
  form.append("plaintextSha256", input.evidence.plaintextSha256);
  form.append("encryptedPayloadSha256", input.evidence.encryptedPayloadSha256);
  form.append("encryptedMetadataSha256", input.evidence.encryptedMetadataSha256);
  form.append("proofHash", input.evidence.proofHash);
  form.append("keyCommitment", input.evidence.keyCommitment);
  form.append("iv", input.evidence.iv);
  form.append("metadataIv", input.evidence.metadataIv);
  form.append("encryptedMetadata", uint8ArrayToBase64(input.evidence.encryptedMetadata));
  form.append("wrappedKey", uint8ArrayToBase64(input.evidence.wrappedKey));
  form.append("signature", signature);
  return fetchJson("/api/v1/uploads", { method: "POST", body: form });
}

export async function createVaultOnChain(
  address: string,
  args: { payloadHash: string; payloadCid: string; keyCommitment: string; checkInInterval: number; gracePeriod: number },
): Promise<{ hash: string; vaultId: string }> {
  if (address.toLowerCase() !== BASE_SEPOLIA_CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error(
      `Contract configuration mismatch. Frontend expects ${BASE_SEPOLIA_CONTRACT_ADDRESS}, backend returned ${address}.`,
    );
  }
  const targetAddress = BASE_SEPOLIA_CONTRACT_ADDRESS;
  const verificationProvider = await walletProvider();
  const contractCode = await verificationProvider.getCode(targetAddress);
  if (contractCode === "0x") {
    throw new Error(`No contract bytecode exists at ${targetAddress}. Deploy GhostProtocol on this network first.`);
  }
  const contract = await contractFor(targetAddress);
  console.log("[ghost:createVault]", JSON.stringify({
    contractAddress: targetAddress,
    chainId: EXPECTED_CHAIN_ID,
  }));
  const tx = await contract.createVault(
    args.payloadHash,
    args.payloadCid,
    args.keyCommitment,
    args.checkInInterval,
    args.gracePeriod,
  );
  if (tx.to && tx.to.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      `Wallet transaction destination mismatch: attempted ${tx.to}, expected ${address}.`,
    );
  }
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Vault creation transaction failed.");
  console.log("[ghost:createVault:receipt]", JSON.stringify({
    transactionHash: receipt.hash,
    receiptTo: receipt.to,
    expectedContractAddress: address,
  }));
  if (receipt.to?.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      `Mined transaction reached ${receipt.to ?? "(unknown contract)"}, but Ghost Protocol expected ${address}. Cancel this deployment and confirm the Base Sepolia contract target.`,
    );
  }
  let vaultId: string | undefined;
  for (const log of receipt.logs as readonly Log[]) {
    try {
      const event = contract.interface.parseLog(log);
      if (event?.name === "VaultCreated") {
        vaultId = BigInt(event.args.vaultId).toString();
        break;
      }
    } catch {
      continue;
    }
  }
  if (!vaultId) throw new Error("Vault creation transaction confirmed, but its VaultCreated event was not found.");
  return { hash: receipt.hash, vaultId };
}

export async function anchorStagedVaultFile(uploadId: string, vaultId: string, transactionHash: string) {
  return fetchJson<{ uploadId: string; vaultId: string; transactionHash: string; status: string }>(
    `/api/v1/uploads/${encodeURIComponent(uploadId)}/anchor`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultId, transactionHash }),
    },
  );
}

export async function sendHeartbeatOnChain(address: string, vaultId: string) {
  const contract = await contractFor(address);
  return (await contract.sendHeartbeat(BigInt(vaultId))).wait();
}

export async function cancelVaultOnChain(address: string, vaultId: string) {
  const contract = await contractFor(address);
  return (await contract.cancelVault(BigInt(vaultId))).wait();
}

export async function triggerExpiredVaultOnChain(address: string, vaultId: string, ownerAddress: string) {
  const provider = await walletProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error("Connect the vault owner wallet to trigger and release this record.");
  }
  const contract = new Contract(address, GHOST_PROTOCOL_ABI, signer);
  const transaction = await contract.checkAndTriggerExpired(BigInt(vaultId));
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Expired-vault trigger transaction failed.");
  return receipt;
}

export async function releaseVaultWithProofOnChain(address: string, vaultId: string, proofHash: string) {
  const contract = await contractFor(address);
  return (await contract.releaseVaultWithProof(BigInt(vaultId), proofHash)).wait();
}

function accessMessage(
  action: "verify" | "download",
  chainId: string,
  contractAddress: string,
  vaultId: string,
  proofHash: string,
): string {
  return [
    "Ghost Protocol vault file access",
    `action: ${action}`,
    `chainId: ${chainId}`,
    `contractAddress: ${contractAddress.toLowerCase()}`,
    `vaultId: ${vaultId}`,
    `proofHash: ${proofHash.toLowerCase()}`,
  ].join("\n");
}

async function authorizedFileRequest<T>(
  action: "verify" | "download",
  contractAddress: string,
  vaultId: string,
  proofHash: string,
): Promise<T> {
  const provider = await walletProvider();
  const signer = await provider.getSigner();
  const chainId = (await provider.getNetwork()).chainId.toString();
  const signature = await signer.signMessage(accessMessage(action, chainId, contractAddress, vaultId, proofHash));
  return fetchJson<T>(
    action === "verify" ? `/api/v1/vaults/${vaultId}/proof` : `/api/v1/vaults/${vaultId}/file`,
    { headers: { "x-wallet-signature": signature } },
  );
}

type ProofResponse = {
  verified: boolean;
  proofHash: string;
  plaintextSha256: string;
  encryptedPayloadSha256: string;
  encryptedMetadataSha256: string;
  keyCommitment: string;
};

type DownloadResponse = Omit<ReleasedVaultFile, "encryptedData" | "encryptedMetadata" | "wrappedKey"> & {
  encryptedData: string;
  encryptedMetadata: string;
  wrappedKey: string;
};

async function downloadAndDecrypt(
  contractAddress: string,
  vaultId: string,
  proofHash: string,
  passphrase: string,
): Promise<{ blob: Blob; fileName: string }> {
  const proof = await authorizedFileRequest<ProofResponse>("verify", contractAddress, vaultId, proofHash);
  if (!proof.verified || proof.proofHash.toLowerCase() !== proofHash.toLowerCase()) {
    throw new Error("The stored file proof does not match the on-chain commitment.");
  }
  const response = await authorizedFileRequest<DownloadResponse>("download", contractAddress, vaultId, proofHash);
  const file: ReleasedVaultFile = {
    ...response,
    encryptedData: base64ToUint8Array(response.encryptedData),
    encryptedMetadata: base64ToUint8Array(response.encryptedMetadata),
    wrappedKey: base64ToUint8Array(response.wrappedKey),
  };
  return decryptReleasedVaultFile(file, passphrase);
}

export async function releaseAndDownloadVaultFile(
  contractAddress: string,
  vaultId: string,
  proofHash: string,
  passphrase: string,
): Promise<{ transactionHash: string; fileName: string }> {
  const proof = await authorizedFileRequest<ProofResponse>("verify", contractAddress, vaultId, proofHash);
  if (!proof.verified || proof.proofHash.toLowerCase() !== proofHash.toLowerCase()) {
    throw new Error("The stored file proof does not match the on-chain commitment.");
  }
  const contract = await contractFor(contractAddress);
  const tx = await contract.releaseVaultWithProof(BigInt(vaultId), proofHash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("On-chain proof release failed.");
  const result = await downloadAndDecrypt(contractAddress, vaultId, proofHash, passphrase);
  const objectUrl = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = result.fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  return { transactionHash: receipt.hash, fileName: result.fileName };
}

export async function downloadReleasedVaultFile(
  contractAddress: string,
  vaultId: string,
  proofHash: string,
  passphrase: string,
): Promise<string> {
  const result = await downloadAndDecrypt(contractAddress, vaultId, proofHash, passphrase);
  const objectUrl = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = result.fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  return result.fileName;
}
