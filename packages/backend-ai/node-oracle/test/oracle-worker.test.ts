import assert from "node:assert/strict";
import test from "node:test";
import { OracleWorker } from "../src/oracle-worker.js";

const expiredVault = {
  id: 1n,
  state: 0,
  expired: true,
};

test("oracle worker relays expired vaults when auto-trigger is enabled", async () => {
  const calls: bigint[] = [];
  const service = {
    scanExpiredVaults: async () => [expiredVault],
    triggerExpired: async (id: bigint) => {
      calls.push(id);
      return { hash: "0xabc", blockNumber: 1 };
    },
  };
  const worker = new OracleWorker(service as any, 1000, true, () => undefined);

  await worker.scanOnce();

  assert.deepEqual(calls, [1n]);
});

test("oracle worker can scan without relaying transactions", async () => {
  let calls = 0;
  const service = {
    scanExpiredVaults: async () => [expiredVault],
    triggerExpired: async () => {
      calls += 1;
      return { hash: "0xabc", blockNumber: 1 };
    },
  };
  const worker = new OracleWorker(service as any, 1000, false, () => undefined);

  await worker.scanOnce();

  assert.equal(calls, 0);
});
