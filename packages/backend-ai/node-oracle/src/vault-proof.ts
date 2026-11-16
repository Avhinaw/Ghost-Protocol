import { createHash } from "node:crypto";

export type VaultProofManifest = {
  plaintextSha256: string;
  encryptedPayloadSha256: string;
  encryptedMetadataSha256: string;
  iv: string;
  metadataIv: string;
  keyCommitment: string;
};

export function sha256Hex(data: Uint8Array): string {
  return `0x${createHash("sha256").update(data).digest("hex")}`;
}

export function canonicalProofManifest(manifest: VaultProofManifest): string {
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

export function computeProofHash(manifest: VaultProofManifest): string {
  return sha256Hex(Buffer.from(canonicalProofManifest(manifest), "utf8"));
}

export function computeEncryptedPayloadHash(iv: string, encryptedData: Uint8Array): string {
  const ivBytes = Buffer.from(iv, "base64");
  return sha256Hex(Buffer.concat([ivBytes, Buffer.from(encryptedData)]));
}
