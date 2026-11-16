export type WalletModel = {
  address: string;
  createdAt: Date;
  updatedAt: Date;
};

export type VaultFileModel = {
  chainId: string;
  contractAddress: string;
  vaultId: string;
  ownerAddress: string;
  fileName: string;
  contentType: string;
  payloadHash: string;
  iv: string;
  encryptedData: Buffer;
  createdAt: Date;
  updatedAt: Date;
};
