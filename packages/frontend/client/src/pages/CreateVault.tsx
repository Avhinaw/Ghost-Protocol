/* Ghost Protocol create flow: an interactive assembly bay for a local encrypted vault. */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, FileLock2, FileUp, Fingerprint, Loader2, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { createVaultOnChain, prepareEncryptedEvidence, storeEncryptedVaultFile } from "../lib/ghost";
import { useGhostData } from "../hooks/useGhostData";

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CreateVault() {
  const [, setLocation] = useLocation();
  const { config } = useGhostData();
  const [file, setFile] = useState<File | null>(null);
  const [interval, setIntervalValue] = useState("604800");
  const [grace, setGrace] = useState("172800");
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    vaultId: string;
    payloadHash: string;
    iv: string;
    encryptedData: Uint8Array;
    file: File;
    contractAddress: string;
  } | null>(null);

  function acceptFile(nextFile?: File) {
    if (!nextFile || pendingUpload) return;
    setFile(nextFile);
  }

  async function saveEncryptedFile(input: NonNullable<typeof pendingUpload>) {
    await storeEncryptedVaultFile(input);
    toast.success(`Encrypted file saved for vault #${input.vaultId}`);
    setLocation(`/vault/${input.vaultId}`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pendingUpload) {
      setBusy(true);
      try { await saveEncryptedFile(pendingUpload); }
      catch (cause) { toast.error(cause instanceof Error ? cause.message : "Encrypted file upload failed"); }
      finally { setBusy(false); }
      return;
    }
    if (!file) { toast.error("Choose a file before opening the vault."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Choose a file no larger than 8 MB."); return; }
    if (!config?.contractAddress) { toast.error("The backend has not returned a contract address yet."); return; }
    setBusy(true);
    try {
      const evidence = await prepareEncryptedEvidence(file);
      const result = await createVaultOnChain(config.contractAddress, { ...evidence, checkInInterval: Number(interval), gracePeriod: Number(grace) });
      const upload = {
        vaultId: result.vaultId,
        payloadHash: evidence.payloadHash,
        iv: evidence.iv,
        encryptedData: evidence.encryptedData,
        file,
        contractAddress: config.contractAddress,
      };
      setPendingUpload(upload);
      try {
        await saveEncryptedFile(upload);
      } catch (cause) {
        toast.error(`Vault #${result.vaultId} was created, but its encrypted file was not saved. Retry the upload: ${cause instanceof Error ? cause.message : "request failed"}`);
      }
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Vault creation failed"); }
    finally { setBusy(false); }
  }

  const sourceReady = Boolean(file);
  const timingReady = interval !== "" && grace !== "";
  const progress = sourceReady && timingReady ? 100 : sourceReady ? 68 : 28;

  return <div className="create-page">
    <Link href="/" className="inline-flex items-center gap-2 muted text-sm create-back"><ArrowLeft size={15} /> Back to operations</Link>
    <section className="create-heading" data-scroll-reveal><div><div className="eyebrow">02 / New vault / assembly</div><h1 className="detail-title">Build a release path<br /><em className="create-heading-accent">before you need it.</em></h1></div><div className="create-orb" aria-hidden="true"><Sparkles size={18} /><span>LOCAL<br />ENCRYPTION</span></div></section>
    <div className="create-steps" aria-label="Vault assembly progress"><div className={`create-step ${sourceReady ? "is-done" : "is-active"}`}><span>01</span><b>Source</b><small>{sourceReady ? "Loaded" : "Select file"}</small></div><div className={`create-step ${timingReady ? "is-active" : ""}`}><span>02</span><b>Heartbeat</b><small>Set timing</small></div><div className={`create-step ${sourceReady && timingReady ? "is-active" : ""}`}><span>03</span><b>Commit</b><small>Sign on-chain</small></div><div className="create-progress"><span style={{ width: `${progress}%` }} /></div></div>
    <div className="create-layout">
      <form className="create-form" onSubmit={submit} data-scroll-reveal>
        <div className="create-form-top"><span className="micro copper">Vault parameters</span><span className="create-live"><i /> LIVE DRAFT</span></div>
        <div className={`create-dropzone ${dragActive ? "is-dragging" : ""} ${file ? "has-file" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); acceptFile(event.dataTransfer.files?.[0]); }}>
          <img className="create-surface-image" src="/Futuristic%20Orange%20Light%20Ribbons.png" alt="" aria-hidden="true" />
          <Input id="evidence" className="create-file-input" type="file" disabled={Boolean(pendingUpload)} onChange={(event) => acceptFile(event.target.files?.[0])} />
          <label htmlFor="evidence" className="create-drop-content"><span className="create-drop-icon">{file ? <Check size={22} /> : <FileUp size={22} />}</span><span className="micro">{file ? "Payload selected" : dragActive ? "Release to load" : "Drop synthetic evidence"}</span><strong>{file ? file.name : "Choose a document to encrypt"}</strong><small>{file ? `${formatBytes(file.size)} · ready for browser encryption` : "TXT or PDF · max 8 MB · local only"}</small></label>
        </div>
        <div className="create-fields"><div className="create-field"><Label htmlFor="interval"><SlidersHorizontal size={14} /> Check-in interval</Label><select id="interval" value={interval} onChange={(event) => setIntervalValue(event.target.value)}><option value="3600">1 hour / local test</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option></select><span>How often the owner confirms they are safe.</span></div><div className="create-field"><Label htmlFor="grace"><Fingerprint size={14} /> Grace period</Label><select id="grace" value={grace} onChange={(event) => setGrace(event.target.value)}><option value="3600">1 hour / local test</option><option value="172800">48 hours</option><option value="604800">7 days</option></select><span>Extra time before an eligible trigger.</span></div></div>
        <div className="create-submit"><div><span className="micro muted">READY STATE</span><strong>{pendingUpload ? `Vault #${pendingUpload.vaultId} created / file pending` : !file ? "Waiting for a source" : config?.contractAddress ? "Ready to sign" : "Waiting for chain"}</strong></div><Button type="submit" className="button-primary create-commit" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" /> {pendingUpload ? "Saving encrypted file…" : "Encrypting & signing…"}</> : <>{pendingUpload ? "Retry encrypted file save" : "Commit vault"} <ShieldCheck size={16} /></>}</Button></div>
      </form>
      <aside className="create-side" data-scroll-reveal><div className="create-preview panel"><img className="create-surface-image" src="/Futuristic%20Orange%20Light%20Ribbons.png" alt="" aria-hidden="true" /><div className="panel-header"><h2 className="panel-title">Vault preview</h2><span className="micro copper">DRAFT / 02</span></div><div className="create-preview-core"><div className="create-preview-ring" style={{ "--progress": progress } as React.CSSProperties}><span>{progress}%</span><small>prepared</small></div><div className="create-preview-copy"><strong>{file ? "Source recognized" : "Awaiting source"}</strong><span>{file ? "The browser can now derive the encrypted payload." : "Your file remains local until encryption begins."}</span></div></div><dl className="rule-list"><div className="rule-row"><dt>Payload</dt><dd className="mono">{file ? formatBytes(file.size) : "—"}</dd></div><div className="rule-row"><dt>Heartbeat</dt><dd>{interval === "3600" ? "1 hour" : interval === "86400" ? "24 hours" : interval === "604800" ? "7 days" : "30 days"}</dd></div><div className="rule-row"><dt>Contract</dt><dd className="mono">{config?.contractAddress ? `${config.contractAddress.slice(0, 8)}…` : "Waiting"}</dd></div></dl></div><div className="create-warning"><span className="status-dot copper" /><span>Prototype boundary: local demo CID and browser-held key. Use synthetic material only.</span></div></aside>
    </div>
  </div>;
}
