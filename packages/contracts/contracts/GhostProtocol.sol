// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGhostProtocol} from "./IGhostProtocol.sol";

/// @title GhostProtocol
/// @notice Testnet-first encrypted evidence vault with a dead-man's-switch trigger.
/// @dev The contract stores metadata and a commitment to the release key. The raw
///      key is only accepted after a vault has entered Triggered state. This is a
///      prototype release mechanism and must be replaced or hardened for production.
contract GhostProtocol is Ownable, IGhostProtocol {
    uint64 public constant MIN_CHECK_IN_INTERVAL = 1 hours;
    uint64 public constant MAX_CHECK_IN_INTERVAL = 365 days;
    uint64 public constant MAX_GRACE_PERIOD = 30 days;

    uint256 private _nextVaultId = 1;
    mapping(uint256 => Vault) private _vaults;
    mapping(address => bool) public authorizedOracles;

    error InvalidPayloadHash();
    error InvalidPayloadCid();
    error InvalidKeyCommitment();
    error InvalidCheckInInterval();
    error InvalidGracePeriod();
    error VaultNotFound();
    error NotVaultOwner();
    error InvalidVaultState(VaultState expected, VaultState actual);
    error HeartbeatExpired();
    error HeartbeatStillValid();
    error NotAuthorizedOracle();
    error EvidenceHashRequired();
    error ReleaseKeyRequired();
    error InvalidReleaseKey();
    error ZeroAddress();

    constructor(address initialOwner, address initialOracle) Ownable(initialOwner) {
        if (initialOwner == address(0) || initialOracle == address(0)) revert ZeroAddress();
        authorizedOracles[initialOracle] = true;
        emit OracleAuthorizationUpdated(initialOracle, true);
    }

    modifier vaultExists(uint256 vaultId) {
        if (vaultId == 0 || vaultId >= _nextVaultId) revert VaultNotFound();
        _;
    }

    modifier onlyVaultOwner(uint256 vaultId) {
        if (_vaults[vaultId].owner != msg.sender) revert NotVaultOwner();
        _;
    }

    function createVault(
        bytes32 payloadHash,
        string calldata payloadCid,
        bytes32 keyCommitment,
        uint64 checkInInterval,
        uint64 gracePeriod
    ) external override returns (uint256 vaultId) {
        if (payloadHash == bytes32(0)) revert InvalidPayloadHash();
        if (bytes(payloadCid).length == 0) revert InvalidPayloadCid();
        if (keyCommitment == bytes32(0)) revert InvalidKeyCommitment();
        if (
            checkInInterval < MIN_CHECK_IN_INTERVAL ||
            checkInInterval > MAX_CHECK_IN_INTERVAL
        ) revert InvalidCheckInInterval();
        if (gracePeriod == 0 || gracePeriod > MAX_GRACE_PERIOD) revert InvalidGracePeriod();

        vaultId = _nextVaultId++;
        uint64 timestamp = uint64(block.timestamp);
        _vaults[vaultId] = Vault({
            owner: msg.sender,
            payloadHash: payloadHash,
            payloadCid: payloadCid,
            keyCommitment: keyCommitment,
            checkInInterval: checkInInterval,
            gracePeriod: gracePeriod,
            createdAt: timestamp,
            lastHeartbeat: timestamp,
            triggeredAt: 0,
            triggerEvidenceHash: bytes32(0),
            state: VaultState.Active,
            releaseKey: ""
        });

        emit VaultCreated(
            vaultId,
            msg.sender,
            payloadHash,
            payloadCid,
            checkInInterval,
            gracePeriod
        );
    }

    function sendHeartbeat(uint256 vaultId)
        external
        override
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        Vault storage vault = _vaults[vaultId];
        if (vault.state != VaultState.Active) {
            revert InvalidVaultState(VaultState.Active, vault.state);
        }
        if (isExpired(vaultId)) revert HeartbeatExpired();

        vault.lastHeartbeat = uint64(block.timestamp);
        emit HeartbeatReceived(vaultId, msg.sender, uint64(block.timestamp));
    }

    function cancelVault(uint256 vaultId)
        external
        override
        vaultExists(vaultId)
        onlyVaultOwner(vaultId)
    {
        Vault storage vault = _vaults[vaultId];
        if (vault.state != VaultState.Active) {
            revert InvalidVaultState(VaultState.Active, vault.state);
        }

        vault.state = VaultState.Cancelled;
        emit VaultCancelled(vaultId, msg.sender);
    }

    function checkAndTriggerExpired(uint256 vaultId)
        external
        override
        vaultExists(vaultId)
    {
        Vault storage vault = _vaults[vaultId];
        if (vault.state != VaultState.Active) {
            revert InvalidVaultState(VaultState.Active, vault.state);
        }
        if (!isExpired(vaultId)) revert HeartbeatStillValid();

        _trigger(vaultId, false, bytes32(0));
    }

    function triggerViaOracle(uint256 vaultId, bytes32 evidenceHash)
        external
        override
        vaultExists(vaultId)
    {
        if (!authorizedOracles[msg.sender]) revert NotAuthorizedOracle();
        if (evidenceHash == bytes32(0)) revert EvidenceHashRequired();

        Vault storage vault = _vaults[vaultId];
        if (vault.state != VaultState.Active) {
            revert InvalidVaultState(VaultState.Active, vault.state);
        }

        _trigger(vaultId, true, evidenceHash);
    }

    function releaseVault(uint256 vaultId, bytes calldata releaseKey)
        external
        override
        vaultExists(vaultId)
    {
        Vault storage vault = _vaults[vaultId];
        if (vault.state != VaultState.Triggered) {
            revert InvalidVaultState(VaultState.Triggered, vault.state);
        }
        if (releaseKey.length == 0) revert ReleaseKeyRequired();
        if (keccak256(releaseKey) != vault.keyCommitment) revert InvalidReleaseKey();

        vault.releaseKey = releaseKey;
        vault.state = VaultState.Released;
        emit VaultReleased(vaultId, msg.sender);
    }

    function setOracle(address oracle, bool authorized) external onlyOwner {
        if (oracle == address(0)) revert ZeroAddress();
        authorizedOracles[oracle] = authorized;
        emit OracleAuthorizationUpdated(oracle, authorized);
    }

    function getVault(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (Vault memory)
    {
        return _vaults[vaultId];
    }

    function vaultCount() external view returns (uint256) {
        return _nextVaultId - 1;
    }

    function isExpired(uint256 vaultId)
        public
        view
        vaultExists(vaultId)
        returns (bool)
    {
        Vault storage vault = _vaults[vaultId];
        if (vault.state != VaultState.Active) return false;
        return block.timestamp >= uint256(vault.lastHeartbeat) + vault.checkInInterval + vault.gracePeriod;
    }

    function heartbeatDeadline(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (uint256)
    {
        Vault storage vault = _vaults[vaultId];
        return uint256(vault.lastHeartbeat) + vault.checkInInterval + vault.gracePeriod;
    }

    function _trigger(uint256 vaultId, bool oracleOverride, bytes32 evidenceHash) internal {
        Vault storage vault = _vaults[vaultId];
        vault.state = VaultState.Triggered;
        vault.triggeredAt = uint64(block.timestamp);
        vault.triggerEvidenceHash = evidenceHash;
        emit VaultTriggered(vaultId, msg.sender, oracleOverride, evidenceHash);
    }
}
