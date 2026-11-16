export type WalletModel = {
  address: string;
  createdAt: Date;
  updatedAt: Date;
};

export type VaultFileStatus = "PENDING_ANCHOR" | "ANCHORED";

export type VaultFileModel = {
  uploadId: string;
  chainId: string;
  contractAddress: string;
  vaultId?: string;
  ownerAddress: string;
  plaintextSha256: string;
  encryptedPayloadSha256: string;
  encryptedMetadataSha256: string;
  proofHash: string;
  keyCommitment: string;
  iv: string;
  metadataIv: string;
  encryptedData: Buffer;
  encryptedMetadata: Buffer;
  wrappedKey: Buffer;
  status: VaultFileStatus;
  anchorTxHash?: string;
  anchorBlockNumber?: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
};
