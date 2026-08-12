export const GHOST_PROTOCOL_ABI = [
  "function createVault(bytes32 payloadHash, string payloadCid, bytes32 keyCommitment, uint64 checkInInterval, uint64 gracePeriod) returns (uint256 vaultId)",
  "function sendHeartbeat(uint256 vaultId)",
  "function vaultCount() view returns (uint256)",
  "function getVault(uint256 vaultId) view returns (tuple(address owner, bytes32 payloadHash, string payloadCid, bytes32 keyCommitment, uint64 checkInInterval, uint64 gracePeriod, uint64 createdAt, uint64 lastHeartbeat, uint64 triggeredAt, bytes32 triggerEvidenceHash, uint8 state, bytes releaseKey))",
  "function heartbeatDeadline(uint256 vaultId) view returns (uint256)",
  "function isExpired(uint256 vaultId) view returns (bool)",
  "function authorizedOracles(address) view returns (bool)",
  "function checkAndTriggerExpired(uint256 vaultId)",
  "function triggerViaOracle(uint256 vaultId, bytes32 evidenceHash)",
  "event VaultCreated(uint256 indexed vaultId, address indexed owner, bytes32 indexed payloadHash, string payloadCid, uint64 checkInInterval, uint64 gracePeriod)",
  "event HeartbeatReceived(uint256 indexed vaultId, address indexed owner, uint64 timestamp)",
  "event VaultTriggered(uint256 indexed vaultId, address indexed caller, bool oracleOverride, bytes32 evidenceHash)",
  "event VaultReleased(uint256 indexed vaultId, address indexed caller)",
  "event VaultCancelled(uint256 indexed vaultId, address indexed owner)",
] as const;

export enum VaultState {
  Active = 0,
  Triggered = 1,
  Released = 2,
  Cancelled = 3,
}

export const VAULT_STATE_NAMES = ["Active", "Triggered", "Released", "Cancelled"] as const;
