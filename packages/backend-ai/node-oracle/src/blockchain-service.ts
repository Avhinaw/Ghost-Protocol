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
  documentReleased: boolean;
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

  private async withRpcRetry<T>(
    operation: () => Promise<T>,
    attempts = 6,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!this.isRpcRateLimit(error) || attempt === attempts - 1) throw error;
        const delayMs = Math.min(1000 * 2 ** attempt, 20_000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }

  private isRpcRateLimit(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const details = error as Error & { code?: unknown; shortMessage?: unknown };
    const text = [
      error.message,
      typeof details.shortMessage === "string" ? details.shortMessage : "",
      typeof details.code === "number" ? details.code.toString() : "",
      typeof details.code === "string" ? details.code : "",
    ].join(" ").toLowerCase();
    return text.includes("-32007")
      || text.includes("25/second")
      || text.includes("rate limit")
      || text.includes("too many requests")
      || text.includes("429");
  }

  async chainId(): Promise<bigint> {
    return (await this.withRpcRetry(() => this.provider.getNetwork())).chainId;
  }

  async oracleAddress(): Promise<string | null> {
    return this.oracleWallet ? await this.oracleWallet.getAddress() : null;
  }

  async vaultCount(): Promise<bigint> {
    return BigInt(await this.withRpcRetry(() => this.contract.vaultCount()));
  }

  async getBlockNumber(): Promise<number> {
    return this.withRpcRetry(() => this.provider.getBlockNumber());
  }

  async getCode(address: string): Promise<string> {
    return this.withRpcRetry(() => this.provider.getCode(address));
  }

  async getTransactionReceipt(hash: string) {
    return this.withRpcRetry(() => this.provider.getTransactionReceipt(hash));
  }

  async isConfiguredOracle(): Promise<boolean | null> {
    if (!this.oracleWallet) return null;
    return Boolean(await this.contract.authorizedOracles(await this.oracleWallet.getAddress()));
  }

  async getVault(vaultId: bigint | number): Promise<VaultRecord> {
    const id = BigInt(vaultId);
    const [raw, deadline, expired] = await this.withRpcRetry(
      () => Promise.all([
        this.contract.getVault(id),
        this.contract.heartbeatDeadline(id),
        this.contract.isExpired(id),
      ]),
    );
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
      documentReleased: state === VaultState.Released,
      deadline: BigInt(deadline),
      expired: Boolean(expired),
    };
  }

  async listVaults(): Promise<VaultRecord[]> {
    const vaults: VaultRecord[] = [];
    const total = Number(await this.vaultCount());
    for (let id = 1; id <= total; id += 1) {
      try {
        vaults.push(await this.getVault(id));
      } catch (error) {
        if (this.isMissingVaultError(error)) {
          console.log("[vaults] Stopped at nonexistent vault:", JSON.stringify({
            vaultId: id,
            contractVaultCount: total,
          }));
          break;
        }
        throw error;
      }
    }
    return vaults;
  }

  private isMissingVaultError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const details = error as Error & {
      code?: unknown;
      shortMessage?: unknown;
      reason?: unknown;
      revert?: unknown;
    };
    const text = [
      error.message,
      typeof details.shortMessage === "string" ? details.shortMessage : "",
      typeof details.reason === "string" ? details.reason : "",
    ].join(" ").toLowerCase();
    return details.code === "CALL_EXCEPTION"
      && (text.includes("missing revert data")
        || text.includes("vaultnotfound")
        || details.revert === null);
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
