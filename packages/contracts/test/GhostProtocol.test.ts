import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

async function expectRevert(action: () => Promise<unknown>, message: string) {
  let reverted = false;
  try {
    await action();
  } catch (error) {
    reverted = true;
    expect(String(error)).to.include(message);
  }
  expect(reverted).to.equal(true);
}

describe("GhostProtocol", function () {
  let contract: any;
  let owner: any;
  let oracle: any;
  let user: any;
  let stranger: any;

  const payloadHash = ethers.keccak256(ethers.toUtf8Bytes("encrypted-payload"));
  const payloadCid = "bafybeighostprotocoltestpayload";
  const releaseKey = ethers.toUtf8Bytes("local-demo-release-key");
  const keyCommitment = ethers.keccak256(releaseKey);

  async function deploy() {
    [owner, oracle, user, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("GhostProtocol", owner);
    contract = await factory.deploy(owner.address, oracle.address);
    await contract.waitForDeployment();
  }

  async function createUserVault(interval = DAY, grace = HOUR) {
    await contract
      .connect(user)
      .createVault(payloadHash, payloadCid, keyCommitment, interval, grace);
    return 1n;
  }

  beforeEach(async function () {
    await deploy();
  });

  it("creates a vault in Active state and accepts owner heartbeats", async function () {
    const vaultId = await createUserVault();
    const before = await contract.getVault(vaultId);

    expect(before.owner).to.equal(user.address);
    expect(before.payloadHash).to.equal(payloadHash);
    expect(before.payloadCid).to.equal(payloadCid);
    expect(before.state).to.equal(0n);
    expect(await contract.vaultCount()).to.equal(1n);

    await contract.connect(user).sendHeartbeat(vaultId);
    const after = await contract.getVault(vaultId);
    expect(after.lastHeartbeat).to.be.greaterThanOrEqual(before.lastHeartbeat);
  });

  it("prevents non-owners from sending heartbeats or cancelling", async function () {
    const vaultId = await createUserVault();

    await expectRevert(
      () => contract.connect(stranger).sendHeartbeat(vaultId),
      "NotVaultOwner"
    );
    await expectRevert(
      () => contract.connect(stranger).cancelVault(vaultId),
      "NotVaultOwner"
    );

    await contract.connect(user).cancelVault(vaultId);
    const vault = await contract.getVault(vaultId);
    expect(vault.state).to.equal(3n);
  });

  it("triggers an expired vault and releases only the committed key", async function () {
    const vaultId = await createUserVault(HOUR, HOUR);

    await ethers.provider.send("evm_increaseTime", [2 * HOUR + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await contract.isExpired(vaultId)).to.equal(true);
    await contract.connect(stranger).checkAndTriggerExpired(vaultId);

    let vault = await contract.getVault(vaultId);
    expect(vault.state).to.equal(1n);
    expect(vault.triggerEvidenceHash).to.equal(ethers.ZeroHash);

    await expectRevert(
      () => contract.connect(stranger).releaseVault(vaultId, ethers.toUtf8Bytes("wrong-key")),
      "InvalidReleaseKey"
    );

    await contract.connect(stranger).releaseVault(vaultId, releaseKey);
    vault = await contract.getVault(vaultId);
    expect(vault.state).to.equal(2n);
    expect(vault.releaseKey).to.equal(ethers.hexlify(releaseKey));
  });

  it("allows the authorized oracle to trigger an active vault", async function () {
    const vaultId = await createUserVault();
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("verified-test-evidence"));

    await expectRevert(
      () => contract.connect(stranger).triggerViaOracle(vaultId, evidenceHash),
      "NotAuthorizedOracle"
    );

    await contract.connect(oracle).triggerViaOracle(vaultId, evidenceHash);
    const vault = await contract.getVault(vaultId);
    expect(vault.state).to.equal(1n);
    expect(vault.triggerEvidenceHash).to.equal(evidenceHash);
  });

  it("does not allow an owner to heartbeat after the deadline", async function () {
    const vaultId = await createUserVault(HOUR, HOUR);

    await ethers.provider.send("evm_increaseTime", [2 * HOUR + 1]);
    await ethers.provider.send("evm_mine", []);

    await expectRevert(
      () => contract.connect(user).sendHeartbeat(vaultId),
      "HeartbeatExpired"
    );
  });

  it("rejects invalid vault configuration", async function () {
    await expectRevert(
      () => contract.connect(user).createVault(ethers.ZeroHash, payloadCid, keyCommitment, DAY, HOUR),
      "InvalidPayloadHash"
    );
    await expectRevert(
      () => contract.connect(user).createVault(payloadHash, payloadCid, ethers.ZeroHash, DAY, HOUR),
      "InvalidKeyCommitment"
    );
    await expectRevert(
      () => contract.connect(user).createVault(payloadHash, payloadCid, keyCommitment, 30 * 60, HOUR),
      "InvalidCheckInInterval"
    );
  });
});
