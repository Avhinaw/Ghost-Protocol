import { MongoClient, type Collection, type Db } from "mongodb";
import type { VaultFileModel, WalletModel } from "./models.js";

type WalletDocument = WalletModel & { _id: string };
type VaultFileDocument = VaultFileModel & { _id: string };

export type SaveVaultFileInput = Omit<VaultFileModel, "createdAt" | "updatedAt">;

export interface VaultStore {
  saveVaultFile(file: SaveVaultFileInput): Promise<void>;
  getVaultFile(chainId: string, contractAddress: string, vaultId: string): Promise<VaultFileModel | null>;
}

export class MongoVaultStore implements VaultStore {
  private readonly client: MongoClient;
  private wallets!: Collection<WalletDocument>;
  private vaultFiles!: Collection<VaultFileDocument>;

  constructor(uri: string, databaseName = "ghost_protocol") {
    this.client = new MongoClient(uri);
    this.databaseName = databaseName;
  }

  private readonly databaseName: string;

  async connect(): Promise<void> {
    await this.client.connect();
    const database: Db = this.client.db(this.databaseName);
    this.wallets = database.collection<WalletDocument>("wallets");
    this.vaultFiles = database.collection<VaultFileDocument>("vault_files");
    await Promise.all([
      this.wallets.createIndex({ address: 1 }, { unique: true }),
      this.vaultFiles.createIndex({ chainId: 1, contractAddress: 1, vaultId: 1 }, { unique: true }),
      this.vaultFiles.createIndex({ ownerAddress: 1, updatedAt: -1 }),
    ]);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async saveVaultFile(file: SaveVaultFileInput): Promise<void> {
    const now = new Date();
    const walletAddress = file.ownerAddress.toLowerCase();
    const id = this.vaultFileId(file.chainId, file.contractAddress, file.vaultId);
    await this.wallets.updateOne(
      { _id: walletAddress },
      { $set: { address: walletAddress, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    await this.vaultFiles.updateOne(
      { _id: id },
      {
        $set: { ...file, contractAddress: file.contractAddress.toLowerCase(), ownerAddress: walletAddress, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async getVaultFile(
    chainId: string,
    contractAddress: string,
    vaultId: string,
  ): Promise<VaultFileModel | null> {
    const record = await this.vaultFiles.findOne({
      _id: this.vaultFileId(chainId, contractAddress, vaultId),
    });
    if (!record) return null;
    const { _id: _ignored, ...file } = record;
    return file;
  }

  private vaultFileId(chainId: string, contractAddress: string, vaultId: string): string {
    return `${chainId}:${contractAddress.toLowerCase()}:${vaultId}`;
  }
}
