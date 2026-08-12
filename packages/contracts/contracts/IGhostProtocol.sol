// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGhostProtocol {
    enum VaultState {
        Active,
        Triggered,
        Released,
        Cancelled
    }

    struct Vault {
        address owner;
        bytes32 payloadHash;
        string payloadCid;
        bytes32 keyCommitment;
        uint64 checkInInterval;
        uint64 gracePeriod;
        uint64 createdAt;
        uint64 lastHeartbeat;
        uint64 triggeredAt;
        bytes32 triggerEvidenceHash;
        VaultState state;
        bytes releaseKey;
    }

    event VaultCreated(
        uint256 indexed vaultId,
        address indexed owner,
        bytes32 indexed payloadHash,
        string payloadCid,
        uint64 checkInInterval,
        uint64 gracePeriod
    );

    event HeartbeatReceived(uint256 indexed vaultId, address indexed owner, uint64 timestamp);
    event VaultTriggered(
        uint256 indexed vaultId,
        address indexed caller,
        bool oracleOverride,
        bytes32 evidenceHash
    );
    event VaultReleased(uint256 indexed vaultId, address indexed caller);
    event VaultCancelled(uint256 indexed vaultId, address indexed owner);
    event OracleAuthorizationUpdated(address indexed oracle, bool authorized);

    function createVault(
        bytes32 payloadHash,
        string calldata payloadCid,
        bytes32 keyCommitment,
        uint64 checkInInterval,
        uint64 gracePeriod
    ) external returns (uint256 vaultId);

    function sendHeartbeat(uint256 vaultId) external;
    function cancelVault(uint256 vaultId) external;
    function checkAndTriggerExpired(uint256 vaultId) external;
    function triggerViaOracle(uint256 vaultId, bytes32 evidenceHash) external;
    function releaseVault(uint256 vaultId, bytes calldata releaseKey) external;
}
