const DEVTOOLS = process.env.DEVTOOLS_URL ?? "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.1:3000/review";
const RPC_URL = "http://127.0.0.1:8545";
const USER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const CONTRACT_ABI = [
  "function createVault(bytes32 payloadHash, string payloadCid, bytes32 keyCommitment, uint64 checkInInterval, uint64 gracePeriod) returns (uint256 vaultId)",
  "function vaultCount() view returns (uint256)",
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createTarget() {
  const response = await fetch(`${DEVTOOLS}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create browser target (${response.status})`);
  return response.json();
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
  });
  return {
    async call(method, params = {}) {
      const id = ++sequence;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close: () => socket.close(),
  };
}

async function main() {
  const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } = await import("ethers");
  const config = await fetch("http://127.0.0.1:4000/api/v1/config").then((response) => response.json());
  const provider = new JsonRpcProvider(RPC_URL);
  const user = new Wallet(USER_KEY, provider);
  const contract = new Contract(config.contractAddress, CONTRACT_ABI, user);
  const releaseKeyText = "reviewer-ui-browser-smoke-release-key";
  const releaseKey = toUtf8Bytes(releaseKeyText);
  await (await contract.createVault(keccak256(toUtf8Bytes(`browser-ui-ciphertext-${Date.now()}`)), "local://browser-ui-synthetic-document", keccak256(releaseKey), 3600, 3600)).wait();
  const vaultId = (await contract.vaultCount()).toString();
  const target = await createTarget();
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    await client.call("Page.enable");
    await client.call("Runtime.enable");
    await delay(3_500);
    const evaluate = async (expression) => {
      const result = await client.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };

    const clickByText = async (text) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((element) => element.textContent.includes(${JSON.stringify(text)})); if (!button || button.disabled) return false; button.click(); return true; })()`);
    const contains = async (text) => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);

    if (!(await contains("Signed in as"))) {
      if (!(await clickByText("Enter local reviewer mode"))) {
        const visibleText = await evaluate("document.body.innerText");
        throw new Error(`Local reviewer sign-in button was not available. Visible page text: ${visibleText}`);
      }
      await delay(4_000);
    }
    if (!(await contains("Signed in as"))) throw new Error("Local reviewer session did not reach the console");
    if (!(await contains("Connected"))) throw new Error("Local reviewer console did not connect to the local oracle");
    await evaluate(`(() => { const input = document.querySelector('input[inputmode=numeric]'); const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setValue.call(input, ${JSON.stringify(vaultId)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await delay(250);

    await evaluate(`(() => { const input = document.querySelector('input[type=file]'); const file = new File([${JSON.stringify("OFFICIAL DEATH CERTIFICATE\nSubject: Jordan Example\nCertificate Number: DC-2026-041\nIssued by the Registrar of Vital Records. This document is synthetic and used only for local reviewer UI testing.")}], 'synthetic-reviewer-certificate.txt', { type: 'text/plain' }); const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    if (!(await clickByText("Send for AI assessment"))) throw new Error("Assessment button was not available");
    await delay(1_500);
    if (!(await contains("HUMAN REVIEW REQUIRED"))) throw new Error("Synthetic document did not render a human-review assessment");

    if (!(await clickByText("Reject / no trigger"))) throw new Error("Reject action was not available");
    await delay(1_500);
    if (!(await contains("Rejected.")) || !(await contains("oracle was not called"))) {
      throw new Error(`Reject feedback did not confirm the no-oracle path. Visible page text: ${await evaluate("document.body.innerText")}`);
    }

    await evaluate(`(() => { const input = document.querySelector('input[type=file]'); const file = new File([${JSON.stringify("OFFICIAL DEATH CERTIFICATE\nSubject: Jordan Example\nCertificate Number: DC-2026-042\nIssued by the Registrar of Vital Records. This document is synthetic and used only for local reviewer UI testing.")}], 'synthetic-reviewer-certificate-approval.txt', { type: 'text/plain' }); const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    if (!(await clickByText("Send for AI assessment"))) throw new Error("Second assessment button was not available");
    await delay(1_500);
    await evaluate(`document.querySelector('.approval-check input').click()`);
    if (!(await clickByText("Approve & trigger vault"))) throw new Error("Approval action was not enabled after acknowledgement");
    await delay(1_500);
    if (!(await contains("Triggered."))) throw new Error(`Approval feedback did not confirm the oracle trigger. Visible page text: ${await evaluate("document.body.innerText")}`);

    const userAddress = await user.getAddress();
    await evaluate(`(() => { const account = ${JSON.stringify(userAddress)}; window.ethereum = { request: async ({ method, params = [] }) => { if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account]; const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) }); const payload = await response.json(); if (payload.error) throw new Error(payload.error.message); return payload.result; } }; const input = document.querySelector('input[type=password]'); const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setValue.call(input, ${JSON.stringify(releaseKeyText)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await delay(250);
    if (!(await clickByText("Submit release key"))) throw new Error("Manual release action was not enabled after approval");
    await delay(1_500);
    if (!(await contains("Released locally"))) throw new Error(`Manual release feedback did not confirm success. Visible page text: ${await evaluate("document.body.innerText")}`);

    console.log("Reviewer Console browser smoke passed: local sign-in, synthetic upload, rejection/no-oracle feedback, human approval, and manual release feedback.");
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
