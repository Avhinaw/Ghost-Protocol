import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import { GHOST_PROTOCOL_ABI, VAULT_STATE_NAMES, VaultState } from "./contract-abi.js";

export type VaultRecord = {
  id: bigint;
  owner: string;
  payloadHash: string;
  payloadCid: string;
  keyCommitment: string;
  checkInInterval: bigint;
  gracePeriod: bigint;
  createdAt: bigint;
  lastHeartbeat: bigint;
  triggeredAt: bigint;
  triggerEvidenceHash: string;
  state: VaultState;
  stateName: string;
  releaseKeyAvailable: boolean;
  deadline: bigint;
  expired: boolean;
};

export type TransactionResult = {
  hash: string;
  blockNumber: number | null;
};

export class BlockchainService {
  readonly provider: JsonRpcProvider;
  readonly contract: Contract;
  readonly oracleWallet?: NonceManager;
  readonly contractAddress: string;

  constructor(rpcUrl: string, contractAddress: string, oraclePrivateKey?: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.oracleWallet = oraclePrivateKey
      ? new NonceManager(new Wallet(oraclePrivateKey, this.provider))
      : undefined;
    this.contract = new Contract(
      contractAddress,
      GHOST_PROTOCOL_ABI,
      this.oracleWallet ?? this.provider,
    );
  }

  async chainId(): Promise<bigint> {
    return (await this.provider.getNetwork()).chainId;
  }

  async oracleAddress(): Promise<string | null> {
    return this.oracleWallet ? await this.oracleWallet.getAddress() : null;
  }

  async vaultCount(): Promise<bigint> {
    return BigInt(await this.contract.vaultCount());
  }

  async isConfiguredOracle(): Promise<boolean | null> {
    if (!this.oracleWallet) return null;
    return Boolean(await this.contract.authorizedOracles(await this.oracleWallet.getAddress()));
  }

  async getVault(vaultId: bigint | number): Promise<VaultRecord> {
    const id = BigInt(vaultId);
    const [raw, deadline, expired] = await Promise.all([
      this.contract.getVault(id),
      this.contract.heartbeatDeadline(id),
      this.contract.isExpired(id),
    ]);
    const state = Number(raw.state) as VaultState;

    return {
      id,
      owner: raw.owner,
      payloadHash: raw.payloadHash,
      payloadCid: raw.payloadCid,
      keyCommitment: raw.keyCommitment,
      checkInInterval: BigInt(raw.checkInInterval),
      gracePeriod: BigInt(raw.gracePeriod),
      createdAt: BigInt(raw.createdAt),
      lastHeartbeat: BigInt(raw.lastHeartbeat),
      triggeredAt: BigInt(raw.triggeredAt),
      triggerEvidenceHash: raw.triggerEvidenceHash,
      state,
      stateName: VAULT_STATE_NAMES[state] ?? "Unknown",
      releaseKeyAvailable: Boolean(raw.releaseKey && raw.releaseKey !== "0x"),
      deadline: BigInt(deadline),
      expired: Boolean(expired),
    };
  }

  async listVaults(): Promise<VaultRecord[]> {
    const total = Number(await this.vaultCount());
    const vaults: VaultRecord[] = [];
    for (let id = 1; id <= total; id += 1) {
      vaults.push(await this.getVault(id));
    }
    return vaults;
  }

  async scanExpiredVaults(): Promise<VaultRecord[]> {
    const vaults = await this.listVaults();
    return vaults.filter((vault) => vault.state === VaultState.Active && vault.expired);
  }

  async triggerExpired(vaultId: bigint | number): Promise<TransactionResult> {
    this.requireOracleWallet();
    this.oracleWallet.reset();
    const transaction = await this.contract.checkAndTriggerExpired(BigInt(vaultId));
    const receipt = await transaction.wait();
    return { hash: transaction.hash, blockNumber: receipt?.blockNumber ?? null };
  }

  async triggerViaOracle(
    vaultId: bigint | number,
    evidenceHash: string,
  ): Promise<TransactionResult> {
    this.requireOracleWallet();
    this.oracleWallet.reset();
    const transaction = await this.contract.triggerViaOracle(BigInt(vaultId), evidenceHash);
    const receipt = await transaction.wait();
    return { hash: transaction.hash, blockNumber: receipt?.blockNumber ?? null };
  }

  private requireOracleWallet(): asserts this is this & { oracleWallet: NonceManager } {
    if (!this.oracleWallet) {
      throw new Error("ORACLE_PRIVATE_KEY is required for transaction relaying");
    }
  }
}
