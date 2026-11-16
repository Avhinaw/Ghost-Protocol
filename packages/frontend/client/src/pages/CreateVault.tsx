/* Ghost Protocol create flow: an interactive assembly bay for a local encrypted vault. */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, FileLock2, FileUp, Fingerprint, Loader2, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { anchorStagedVaultFile, createVaultOnChain, prepareEncryptedEvidence, stageEncryptedVaultFile } from "../lib/ghost";
import { useGhostData } from "../hooks/useGhostData";
import { normalizePassphrase } from "../lib/vault-crypto";

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CreateVault() {
  const [, setLocation] = useLocation();
  const { config } = useGhostData();
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirmation, setPassphraseConfirmation] = useState("");
  const [interval, setIntervalValue] = useState("604800");
  const [grace, setGrace] = useState("172800");
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    vaultId: string;
    uploadId: string;
    proofHash: string;
    transactionHash: string;
    contractAddress: string;
  } | null>(null);

  function acceptFile(nextFile?: File) {
    if (!nextFile || pendingUpload) return;
    setFile(nextFile);
  }

  async function saveEncryptedFile(input: NonNullable<typeof pendingUpload>) {
    await anchorStagedVaultFile(input.uploadId, input.vaultId, input.transactionHash);
    toast.success(`Proof anchored for vault #${input.vaultId}`);
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
    let normalizedPassphrase: string;
    try {
      normalizedPassphrase = normalizePassphrase(passphrase);
      if (normalizedPassphrase !== normalizePassphrase(passphraseConfirmation)) {
        toast.error("Passphrases do not match.");
        return;
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Enter a valid recipient passphrase.");
      return;
    }
    setBusy(true);
    try {
      const evidence = await prepareEncryptedEvidence(file, normalizedPassphrase);
      setPassphrase("");
      setPassphraseConfirmation("");
      await stageEncryptedVaultFile({ contractAddress: config.contractAddress, evidence });
      const result = await createVaultOnChain(config.contractAddress, {
        payloadHash: evidence.proofHash,
        payloadCid: `mongo://${evidence.uploadId}`,
        keyCommitment: evidence.keyCommitment,
        checkInInterval: Number(interval),
        gracePeriod: Number(grace),
      });
      const upload = {
        vaultId: result.vaultId,
        uploadId: evidence.uploadId,
        proofHash: evidence.proofHash,
        transactionHash: result.hash,
        contractAddress: config.contractAddress,
      };
      setPendingUpload(upload);
      try {
        await saveEncryptedFile(upload);
      } catch (cause) {
        toast.error(`Vault #${result.vaultId} was created, but proof anchoring did not finish. Retry: ${cause instanceof Error ? cause.message : "request failed"}`);
      }
    } catch (cause) {
      setPassphrase("");
      setPassphraseConfirmation("");
      toast.error(cause instanceof Error ? cause.message : "Vault creation failed");
    }
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
          <label htmlFor="evidence" className="create-drop-content"><span className="create-drop-icon">{file ? <Check size={22} /> : <FileUp size={22} />}</span><span className="micro">{file ? "Payload selected" : dragActive ? "Release to load" : "Choose a file"}</span><strong>{file ? file.name : "Choose a document to encrypt"}</strong><small>{file ? `${formatBytes(file.size)} · ready for browser encryption` : "Any file type · max 8 MB · encrypted in browser"}</small></label>
        </div>
        {!pendingUpload && <div className="create-fields"><div className="create-field"><Label htmlFor="file-passphrase">Recipient passphrase</Label><Input id="file-passphrase" type="password" autoComplete="new-password" minLength={16} maxLength={1024} required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /><span>Use a unique passphrase of 5+ random words (minimum 16 characters). It is never sent to the backend or stored by the app.</span></div><div className="create-field"><Label htmlFor="file-passphrase-confirm">Confirm passphrase</Label><Input id="file-passphrase-confirm" type="password" autoComplete="new-password" minLength={16} maxLength={1024} required value={passphraseConfirmation} onChange={(event) => setPassphraseConfirmation(event.target.value)} /><span>You must remember it; there is no password reset or recovery key.</span></div></div>}
        <div className="create-fields"><div className="create-field"><Label htmlFor="interval"><SlidersHorizontal size={14} /> Check-in interval</Label><select id="interval" value={interval} onChange={(event) => setIntervalValue(event.target.value)}><option value="3600">1 hour / local test</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option></select><span>How often the owner confirms they are safe.</span></div><div className="create-field"><Label htmlFor="grace"><Fingerprint size={14} /> Grace period</Label><select id="grace" value={grace} onChange={(event) => setGrace(event.target.value)}><option value="3600">1 hour / local test</option><option value="172800">48 hours</option><option value="604800">7 days</option></select><span>Extra time before an eligible trigger.</span></div></div>
        <div className="create-submit"><div><span className="micro muted">READY STATE</span><strong>{pendingUpload ? `Vault #${pendingUpload.vaultId} created / anchor pending` : !file ? "Waiting for a source" : config?.contractAddress ? "Ready to sign" : "Waiting for chain"}</strong></div><Button type="submit" className="button-primary create-commit" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" /> {pendingUpload ? "Anchoring proof…" : "Encrypting & signing…"}</> : <>{pendingUpload ? "Retry proof anchoring" : "Commit vault"} <ShieldCheck size={16} /></>}</Button></div>
      </form>
      <aside className="create-side" data-scroll-reveal><div className="create-preview panel"><img className="create-surface-image" src="/Futuristic%20Orange%20Light%20Ribbons.png" alt="" aria-hidden="true" /><div className="panel-header"><h2 className="panel-title">Vault preview</h2><span className="micro copper">DRAFT / 02</span></div><div className="create-preview-core"><div className="create-preview-ring" style={{ "--progress": progress } as React.CSSProperties}><span>{progress}%</span><small>prepared</small></div><div className="create-preview-copy"><strong>{file ? "Source recognized" : "Awaiting source"}</strong><span>{file ? "The browser can now derive the encrypted payload." : "Your file remains local until encryption begins."}</span></div></div><dl className="rule-list"><div className="rule-row"><dt>Payload</dt><dd className="mono">{file ? formatBytes(file.size) : "—"}</dd></div><div className="rule-row"><dt>Heartbeat</dt><dd>{interval === "3600" ? "1 hour" : interval === "86400" ? "24 hours" : interval === "604800" ? "7 days" : "30 days"}</dd></div><div className="rule-row"><dt>Contract</dt><dd className="mono">{config?.contractAddress ? `${config.contractAddress.slice(0, 8)}…` : "Waiting"}</dd></div></dl></div><div className="create-warning"><span className="status-dot copper" /><span>MongoDB stores encrypted bytes and a passphrase-wrapped key; neither plaintext nor passphrase is stored. Use synthetic material only.</span></div></aside>
    </div>
  </div>;
}
