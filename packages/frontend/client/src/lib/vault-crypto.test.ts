import { describe, expect, it } from "vitest";
import { decryptReleasedVaultFile, prepareEncryptedEvidence } from "./vault-crypto";

describe("passphrase-wrapped vault keys", () => {
  it("round-trips arbitrary binary files and rejects an incorrect passphrase", async () => {
    const plaintext = Uint8Array.from([0, 255, 1, 128, 10, 0, 42, 17]);
    const file = new File([plaintext.buffer], "evidence.bin", { type: "application/octet-stream" });
    const passphrase = "correct horse battery staple";
    const prepared = await prepareEncryptedEvidence(
      file,
      "0x0000000000000000000000000000000000000001",
      passphrase,
    );

    expect(prepared.wrappedKey.byteLength).toBe(80);
    expect(new TextDecoder().decode(prepared.wrappedKey.subarray(0, 4))).toBe("GPK1");
    const decrypted = await decryptReleasedVaultFile(prepared, passphrase);
    expect(decrypted.fileName).toBe("evidence.bin");
    expect([...new Uint8Array(await decrypted.blob.arrayBuffer())]).toEqual([...plaintext]);
    await expect(decryptReleasedVaultFile(prepared, "wrong passphrase value"))
      .rejects.toThrow("Passphrase is incorrect");
    const tamperedMetadata = { ...prepared, encryptedMetadata: Uint8Array.from(prepared.encryptedMetadata, (byte) => byte ^ 1) };
    await expect(decryptReleasedVaultFile(tamperedMetadata, passphrase))
      .rejects.toThrow("Encrypted file metadata hash does not match");
  });
});
