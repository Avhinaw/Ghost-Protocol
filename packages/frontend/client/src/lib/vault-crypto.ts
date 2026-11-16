import { keccak256 } from "ethers";
import { argon2id } from "hash-wasm";

const WRAPPED_KEY_MAGIC = new TextEncoder().encode("GPK1");
const WRAPPED_KEY_SALT_LENGTH = 16;
const WRAPPED_KEY_IV_LENGTH = 12;
const WRAPPED_KEY_PACKAGE_LENGTH = 4 + WRAPPED_KEY_SALT_LENGTH + WRAPPED_KEY_IV_LENGTH + 32 + 16;
const ARGON2_MEMORY_KIB = 64 * 1024;
const ARGON2_ITERATIONS = 3;

export type ProofManifest = {
  plaintextSha256: string;
  encryptedPayloadSha256: string;
  encryptedMetadataSha256: string;
  iv: string;
  metadataIv: string;
  keyCommitment: string;
};

export type PreparedVaultFile = ProofManifest & {
  uploadId: string;
  proofHash: string;
  ownerAddress: string;
  encryptedData: Uint8Array;
  encryptedMetadata: Uint8Array;
  wrappedKey: Uint8Array;
};

export type ReleasedVaultFile = PreparedVaultFile;

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function normalizePassphrase(passphrase: string): string {
  const normalized = passphrase.normalize("NFKC");
  const length = Array.from(normalized).length;
  if (length < 16 || length > 1024) {
    throw new Error("Use a passphrase between 16 and 1,024 characters.");
  }
  return normalized;
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const normalized = normalizePassphrase(passphrase);
  const derivedBytes = await argon2id({
    password: normalized,
    salt,
    parallelism: 1,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: 32,
    outputType: "binary",
  });
  try {
    return await crypto.subtle.importKey(
      "raw",
      asArrayBuffer(derivedBytes),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    derivedBytes.fill(0);
  }
}

async function wrapFileKey(aesKey: CryptoKey, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(WRAPPED_KEY_SALT_LENGTH));
  const wrapIv = crypto.getRandomValues(new Uint8Array(WRAPPED_KEY_IV_LENGTH));
  const wrappingKey = await deriveWrappingKey(passphrase, salt);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
  let wrappedBytes: Uint8Array;
  try {
    wrappedBytes = new Uint8Array(await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(wrapIv),
        additionalData: asArrayBuffer(concatBytes(WRAPPED_KEY_MAGIC, salt)),
      },
      wrappingKey,
      asArrayBuffer(rawKey),
    ));
  } finally {
    rawKey.fill(0);
  }
  return concatBytes(WRAPPED_KEY_MAGIC, salt, wrapIv, wrappedBytes);
}

async function unwrapFileKey(wrappedKey: Uint8Array, passphrase: string): Promise<CryptoKey> {
  if (
    wrappedKey.length !== WRAPPED_KEY_PACKAGE_LENGTH ||
    !WRAPPED_KEY_MAGIC.every((byte, index) => wrappedKey[index] === byte)
  ) {
    throw new Error("Unsupported or corrupted wrapped-key package.");
  }
  const saltStart = WRAPPED_KEY_MAGIC.length;
  const ivStart = saltStart + WRAPPED_KEY_SALT_LENGTH;
  const ciphertextStart = ivStart + WRAPPED_KEY_IV_LENGTH;
  const salt = wrappedKey.slice(saltStart, ivStart);
  const wrapIv = wrappedKey.slice(ivStart, ciphertextStart);
  const ciphertext = wrappedKey.slice(ciphertextStart);
  const wrappingKey = await deriveWrappingKey(passphrase, salt);
  let rawKey: Uint8Array;
  try {
    rawKey = new Uint8Array(await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(wrapIv),
        additionalData: asArrayBuffer(concatBytes(WRAPPED_KEY_MAGIC, salt)),
      },
      wrappingKey,
      asArrayBuffer(ciphertext),
    ));
  } catch {
    throw new Error("Passphrase is incorrect or the wrapped file key is corrupted.");
  }
  try {
    if (rawKey.length !== 32) throw new Error("Wrapped file key has an invalid length.");
    return await crypto.subtle.importKey("raw", asArrayBuffer(rawKey), { name: "AES-GCM" }, false, ["decrypt"]);
  } finally {
    rawKey.fill(0);
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", asArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function canonicalProofManifest(manifest: ProofManifest): string {
  return JSON.stringify([
    "ghost-vault-proof-v2",
    manifest.plaintextSha256.toLowerCase(),
    manifest.encryptedPayloadSha256.toLowerCase(),
    manifest.encryptedMetadataSha256.toLowerCase(),
    manifest.iv,
    manifest.metadataIv,
    manifest.keyCommitment.toLowerCase(),
  ]);
}

export async function prepareEncryptedEvidence(
  file: File,
  ownerAddress: string,
  passphrase: string,
): Promise<PreparedVaultFile> {
  normalizePassphrase(passphrase);
  const plaintext = new Uint8Array(await file.arrayBuffer());
  let plaintextSha256: string;
  let encryptedData: Uint8Array;
  try {
    plaintextSha256 = await sha256(plaintext);
    const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    encryptedData = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(ivBytes) },
      aesKey,
      asArrayBuffer(plaintext),
    ));
    const iv = bytesToBase64(ivBytes);
    const encryptedPayloadSha256 = await sha256(concatBytes(ivBytes, encryptedData));
    const metadata = new TextEncoder().encode(JSON.stringify({
      fileName: file.name.slice(0, 180) || "evidence",
      contentType: file.type.slice(0, 160) || "application/octet-stream",
    }));
    const metadataIvBytes = crypto.getRandomValues(new Uint8Array(12));
    const encryptedMetadata = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(metadataIvBytes) },
      aesKey,
      asArrayBuffer(metadata),
    ));
    metadata.fill(0);
    const metadataIv = bytesToBase64(metadataIvBytes);
    const encryptedMetadataSha256 = await sha256(concatBytes(metadataIvBytes, encryptedMetadata));
    const wrappedKey = await wrapFileKey(aesKey, passphrase);
    const keyCommitment = keccak256(wrappedKey);
    const manifest: ProofManifest = {
      plaintextSha256,
      encryptedPayloadSha256,
      encryptedMetadataSha256,
      iv,
      metadataIv,
      keyCommitment,
    };
    const proofHash = await sha256(new TextEncoder().encode(canonicalProofManifest(manifest)));
    return {
      uploadId: crypto.randomUUID(),
      ownerAddress,
      plaintextSha256,
      encryptedPayloadSha256,
      encryptedMetadataSha256,
      iv,
      metadataIv,
      keyCommitment,
      proofHash,
      encryptedData,
      encryptedMetadata,
      wrappedKey,
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptReleasedVaultFile(
  file: ReleasedVaultFile,
  passphrase: string,
): Promise<{ blob: Blob; fileName: string }> {
  const ivBytes = base64ToBytes(file.iv);
  const encryptedHash = await sha256(concatBytes(ivBytes, file.encryptedData));
  if (encryptedHash.toLowerCase() !== file.encryptedPayloadSha256.toLowerCase()) {
    throw new Error("Encrypted file hash does not match the anchored proof");
  }
  const metadataIvBytes = base64ToBytes(file.metadataIv);
  const encryptedMetadataHash = await sha256(concatBytes(metadataIvBytes, file.encryptedMetadata));
  if (encryptedMetadataHash.toLowerCase() !== file.encryptedMetadataSha256.toLowerCase()) {
    throw new Error("Encrypted file metadata hash does not match the anchored proof");
  }
  if (keccak256(file.wrappedKey).toLowerCase() !== file.keyCommitment.toLowerCase()) {
    throw new Error("Wrapped key does not match the on-chain key commitment");
  }
  const proofHash = await sha256(new TextEncoder().encode(canonicalProofManifest(file)));
  if (proofHash.toLowerCase() !== file.proofHash.toLowerCase()) {
    throw new Error("Proof manifest does not match the on-chain hash");
  }
  const aesKey = await unwrapFileKey(file.wrappedKey, passphrase);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(ivBytes) },
    aesKey,
    asArrayBuffer(file.encryptedData),
  ));
  try {
    const plaintextHash = await sha256(plaintext);
    if (plaintextHash.toLowerCase() !== file.plaintextSha256.toLowerCase()) {
      throw new Error("Released document SHA-256 does not match the anchored proof");
    }
    const metadataBytes = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(metadataIvBytes) },
      aesKey,
      asArrayBuffer(file.encryptedMetadata),
    ));
    try {
      const metadata = JSON.parse(new TextDecoder().decode(metadataBytes)) as { fileName?: unknown; contentType?: unknown };
      if (
        typeof metadata.fileName !== "string" ||
        typeof metadata.contentType !== "string" ||
        metadata.fileName.length === 0 ||
        metadata.fileName.length > 180 ||
        metadata.contentType.length > 160
      ) {
        throw new Error("Decrypted file metadata is invalid.");
      }
      const fileName = metadata.fileName.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
      return {
        blob: new Blob([asArrayBuffer(plaintext)], { type: metadata.contentType || "application/octet-stream" }),
        fileName: fileName || "released-document",
      };
    } finally {
      metadataBytes.fill(0);
    }
  } finally {
    plaintext.fill(0);
  }
}

export function base64ToUint8Array(value: string): Uint8Array {
  return base64ToBytes(value);
}

export function uint8ArrayToBase64(value: Uint8Array): string {
  return bytesToBase64(value);
}
