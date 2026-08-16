/* Ghost Protocol style: a briefing-sheet create flow with evidence first and consequences always visible. */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileLock2, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { createVaultOnChain, prepareEncryptedEvidence } from "../lib/ghost";
import { useGhostData } from "../hooks/useGhostData";

export default function CreateVault() {
  const [, setLocation] = useLocation();
  const { config } = useGhostData();
  const [file, setFile] = useState<File | null>(null);
  const [interval, setIntervalValue] = useState("604800");
  const [grace, setGrace] = useState("172800");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { toast.error("Choose a file before opening the vault."); return; }
    if (!config?.contractAddress) { toast.error("The backend has not returned a contract address yet."); return; }
    setBusy(true);
    try {
      const evidence = await prepareEncryptedEvidence(file);
      const result = await createVaultOnChain(config.contractAddress, { ...evidence, checkInInterval: Number(interval), gracePeriod: Number(grace) });
      toast.success(`Vault #${result.vaultId} created`, { description: "Encrypted payload commitment recorded on-chain." });
      setLocation(`/vault/${result.vaultId}`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Vault creation failed"); }
    finally { setBusy(false); }
  }

  return <div>
    <Link href="/" className="inline-flex items-center gap-2 muted text-sm mb-8"><ArrowLeft size={15} /> Back to operations</Link>
    <div className="form-layout">
      <form className="form-sheet" onSubmit={submit}>
        <div className="eyebrow">02 / New vault</div>
        <h1>Commit a protected record.</h1>
        <p className="form-intro">The browser encrypts the selected file before anything reaches storage. This local prototype records a demo CID; the production IPFS adapter will be connected next.</p>
        <div className="field file-drop"><Label htmlFor="evidence">Evidence file</Label><Input id="evidence" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file && <div className="file-name"><FileLock2 size={13} className="inline mr-2" />{file.name} / {(file.size / 1024).toFixed(1)} KB</div>}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="field"><Label htmlFor="interval">Check-in interval</Label><select id="interval" value={interval} onChange={(event) => setIntervalValue(event.target.value)}><option value="3600">1 hour / local test</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option></select></div>
          <div className="field"><Label htmlFor="grace">Grace period</Label><select id="grace" value={grace} onChange={(event) => setGrace(event.target.value)}><option value="3600">1 hour / local test</option><option value="172800">48 hours</option><option value="604800">7 days</option></select></div>
        </div>
        <div className="flex justify-end mt-8"><Button type="submit" className="button-primary" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" /> Encrypting & signing…</> : <>Create vault <ShieldCheck size={16} /></>}</Button></div>
      </form>
      <aside className="panel policy-sheet">
        <div className="panel-header"><h2 className="panel-title">Release brief</h2><span className="micro copper">READ / 02</span></div>
        <dl className="rule-list"><div className="rule-row"><dt>Encryption</dt><dd>AES-256-GCM in browser</dd></div><div className="rule-row"><dt>On-chain record</dt><dd>Payload hash + key commitment</dd></div><div className="rule-row"><dt>Storage adapter</dt><dd className="copper">Local demo CID</dd></div><div className="rule-row"><dt>Contract</dt><dd className="mono">{config?.contractAddress ? `${config.contractAddress.slice(0, 8)}…` : "Waiting"}</dd></div></dl>
        <div className="action-well"><span className="micro copper">Important</span><p>The generated decryption key stays in this browser session. Do not use real evidence until the production key-custody and IPFS flows are implemented.</p></div>
      </aside>
    </div>
  </div>;
}
