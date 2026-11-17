import { MongoClient, type Collection, type Db } from "mongodb";
import type { VaultFileModel, WalletModel } from "./models.js";

type WalletDocument = WalletModel & { _id: string };
type VaultFileDocument = VaultFileModel & { _id: string };

export type StageVaultFileInput = Omit<VaultFileModel, "createdAt" | "updatedAt">;

export interface VaultStore {
  stageVaultFile(file: StageVaultFileInput): Promise<void>;
  anchorVaultFile(input: {
    uploadId: string;
    vaultId: string;
    anchorTxHash: string;
    anchorBlockNumber: number;
  }): Promise<boolean>;
  getVaultFileByUploadId(uploadId: string): Promise<VaultFileModel | null>;
  getVaultFile(chainId: string, contractAddress: string, vaultId: string): Promise<VaultFileModel | null>;
}

export class MongoVaultStore implements VaultStore {
  private readonly client: MongoClient;
  private readonly databaseName: string;
  private wallets!: Collection<WalletDocument>;
  private vaultFiles!: Collection<VaultFileDocument>;

  constructor(uri: string, databaseName = "ghost_protocol") {
    this.client = new MongoClient(uri);
    this.databaseName = databaseName;
  }


  async connect(): Promise<void> {
    await this.client.connect();

    const database: Db = this.client.db(this.databaseName);

    this.wallets = database.collection<WalletDocument>("wallets");
    this.vaultFiles = database.collection<VaultFileDocument>("vault_files");

    // Check and migrate the old index
    const indexes = await this.vaultFiles.indexes();

    const oldIndex = indexes.find(
      (index) =>
        index.name === "chainId_1_contractAddress_1_vaultId_1" &&
        !index.partialFilterExpression
    );

    if (oldIndex) {
      await this.vaultFiles.dropIndex(oldIndex.name!);
    }

    await Promise.all([
      this.wallets.createIndex(
        { address: 1 },
        { unique: true }
      ),

      this.vaultFiles.createIndex(
        { chainId: 1, contractAddress: 1, vaultId: 1 },
        {
          unique: true,
          name: "unique_vault_string_id",
          partialFilterExpression: {
            vaultId: { $type: "string" },
          },
        }
      ),

      this.vaultFiles.createIndex({
        ownerAddress: 1,
        updatedAt: -1,
      }),

      this.vaultFiles.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
      ),
    ]);
  }


  async close(): Promise<void> {
    await this.client.close();
  }

  async stageVaultFile(file: StageVaultFileInput): Promise<void> {
    const now = new Date();
    const walletAddress = file.ownerAddress.toLowerCase();
    await this.wallets.updateOne(
      { _id: walletAddress },
      { $set: { address: walletAddress, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    await this.vaultFiles.insertOne({
      ...file,
      _id: file.uploadId,
      contractAddress: file.contractAddress.toLowerCase(),
      ownerAddress: walletAddress,
      createdAt: now,
      updatedAt: now,
    });
  }

  async anchorVaultFile(input: {
    uploadId: string;
    vaultId: string;
    anchorTxHash: string;
    anchorBlockNumber: number;
  }): Promise<boolean> {
    const result = await this.vaultFiles.updateOne(
      { _id: input.uploadId, status: "PENDING_ANCHOR" },
      {
        $set: {
          vaultId: input.vaultId,
          anchorTxHash: input.anchorTxHash,
          anchorBlockNumber: input.anchorBlockNumber,
          status: "ANCHORED",
          updatedAt: new Date(),
        },
        $unset: { expiresAt: "" },
      },
    );
    return result.modifiedCount === 1;
  }

  async getVaultFileByUploadId(uploadId: string): Promise<VaultFileModel | null> {
    const record = await this.vaultFiles.findOne({ _id: uploadId });
    return record ? this.withoutMongoId(record) : null;
  }

  async getVaultFile(
    chainId: string,
    contractAddress: string,
    vaultId: string,
  ): Promise<VaultFileModel | null> {
    const record = await this.vaultFiles.findOne({
      chainId,
      contractAddress: contractAddress.toLowerCase(),
      vaultId,
      status: "ANCHORED",
    });
    return record ? this.withoutMongoId(record) : null;
  }

  private withoutMongoId(record: VaultFileDocument): VaultFileModel {
    const { _id: _ignored, ...file } = record;
    return file;
  }
}
