/* Ghost Protocol style: vault detail is a calm chain record, with consequences stated before actions. */
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Clock3, Download, Loader2, Radio, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import {
  cancelVaultOnChain,
  downloadReleasedVaultFile,
  fetchJson,
  releaseAndDownloadVaultFile,
  sendHeartbeatOnChain,
  triggerExpiredVaultOnChain,
  type ContractConfig,
  type Vault,
} from "../lib/ghost";
import { normalizePassphrase } from "../lib/vault-crypto";

function short(value: string) { return `${value.slice(0, 10)}…${value.slice(-8)}`; }
function time(value: string) { return new Date(Number(value) * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }

export default function VaultDetail() {
  const [, params] = useRoute<{ id: string }>("/vault/:id");
  const id = params?.id ?? "";
  const [vault, setVault] = useState<Vault | null>(null);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [now, setNow] = useState(Date.now());

  async function refresh() {
    setLoading(true);
    try { const [record, protocol] = await Promise.all([fetchJson<{ vault: Vault }>(`/api/v1/vaults/${id}`), fetchJson<ContractConfig>("/api/v1/config")]); setVault(record.vault); setConfig(protocol); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read this vault"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [id]);
  useEffect(() => {
    if (!vault) return;
    const delay = Number(vault.deadline) * 1000 - Date.now();
    if (delay <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [vault?.deadline]);

  async function action(kind: "heartbeat" | "cancel") {
    if (!config?.contractAddress) { toast.error("No contract address available"); return; }
    setBusy(true);
    try { if (kind === "heartbeat") await sendHeartbeatOnChain(config.contractAddress, id); else if (window.confirm("Cancel this active vault? This cannot be undone.")) await cancelVaultOnChain(config.contractAddress, id); toast.success(kind === "heartbeat" ? "Heartbeat recorded" : "Vault cancelled"); await refresh(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Transaction failed"); }
    finally { setBusy(false); }
  }

  async function releaseOrDownload() {
    if (!config?.contractAddress) { toast.error("No contract address available"); return; }
    if (!vault) return;
    try {
      normalizePassphrase(passphrase);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Enter the recipient passphrase.");
      return;
    }
    setBusy(true);
    try {
      if (vault.stateName === "Active" && deadlinePassed) {
        await triggerExpiredVaultOnChain(config.contractAddress, id, vault.owner);
      }
      if (vault.stateName === "Released") {
        const fileName = await downloadReleasedVaultFile(config.contractAddress, id, vault.payloadHash, passphrase);
        toast.success(`Verified document downloaded: ${fileName}`);
      } else {
        const result = await releaseAndDownloadVaultFile(config.contractAddress, id, vault.payloadHash, passphrase);
        toast.success(`Proof released on-chain; verified document downloaded: ${result.fileName}`);
      }
      setPassphrase("");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Proof release or document download failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !vault) return <div className="loading-line" />;
  if (error || !vault) return <div className="empty-state"><h3>Vault record unavailable.</h3><p>{error ?? "No vault was returned for this identifier."}</p><Link href="/"><Button className="button-quiet">Back to register</Button></Link></div>;
  const isActive = vault.stateName === "Active";
  const canRelease = vault.stateName === "Triggered" || vault.stateName === "Released";
  const deadlinePassed = vault.expired || Number(vault.deadline) * 1000 <= now;
  const canTriggerAndRelease = isActive && deadlinePassed;
  const canHeartbeat = isActive && !deadlinePassed;
  return <div>
    <Link href="/" className="inline-flex items-center gap-2 muted text-sm mb-8"><ArrowLeft size={15} /> Back to operations</Link>
    <div className="detail-layout" data-scroll-reveal>
      <section>
        <div className="detail-hero"><div className="eyebrow">Vault / {id.padStart(4, "0")}</div><h1 className="detail-title">Custody record<br /><em className={vault.stateName === "Active" ? "mineral-italic" : vault.stateName === "Triggered" ? "copper" : ""}>{vault.stateName.toLowerCase()}</em>.</h1><p className="detail-subtitle">A public state record for an encrypted payload. The chain can verify the commitment; it cannot read the plaintext.</p></div>
        {(canRelease || canTriggerAndRelease) && <div className="field mt-6"><label htmlFor="release-passphrase">Recipient passphrase</label><input id="release-passphrase" type="password" autoComplete="current-password" maxLength={1024} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /><small className="muted">Used only in this browser to decrypt after the wallet and proof checks pass. It is never sent to the server.</small></div>}
        <div className="detail-actions">{canHeartbeat && <Button className="button-primary" disabled={busy} onClick={() => void action("heartbeat")}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />} Send heartbeat</Button>}{isActive && <Button variant="outline" className="button-quiet" disabled={busy} onClick={() => void action("cancel")}><X size={16} /> Cancel vault</Button>}{(canRelease || canTriggerAndRelease) && <Button className="button-primary" disabled={busy || passphrase.length === 0} onClick={() => void releaseOrDownload()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {vault.stateName === "Released" ? "Download verified document" : canTriggerAndRelease ? "Trigger timeout, release & download" : "Verify proof, release & download"}</Button>}</div>
        <div className="notice mt-6"><span className="status-dot green" /><span><strong>{canRelease || canTriggerAndRelease ? "Proof-gated document access." : "Owner action required."}</strong> {canRelease ? "The backend verifies the stored bytes against the on-chain proof before release and again before download." : canTriggerAndRelease ? "The deadline has passed. The owner can trigger the timeout, then verify, release, and download the encrypted record in one flow." : isActive ? "Send the next heartbeat before the deadline to keep this record active." : `This record is ${vault.stateName.toLowerCase()}; owner heartbeat actions are closed.`}</span></div>
      </section>
      <aside className="signal-panel"><div className="signal-ring"><Check size={22} className="relative z-10 text-[#A8C1AF]" /></div><span className="signal-label">SIGNAL / {vault.stateName.toUpperCase()}</span></aside>
    </div>
    <section className="panel evidence-panel mt-8" data-scroll-reveal><div className="panel-header"><h2 className="panel-title">Chain record</h2><span className={`state-mark ${vault.stateName.toLowerCase()}`}><span className="status-dot green" />{vault.stateName}</span></div><dl className="rule-list"><div className="rule-row"><dt>Owner</dt><dd className="mono">{short(vault.owner)}</dd></div><div className="rule-row"><dt>Payload CID</dt><dd className="mono">{vault.payloadCid}</dd></div><div className="rule-row"><dt>Payload proof hash</dt><dd className="mono">{short(vault.payloadHash)}</dd></div><div className="rule-row"><dt>Key commitment</dt><dd className="mono">{short(vault.keyCommitment)}</dd></div><div className="rule-row"><dt>Last heartbeat</dt><dd><Clock3 size={13} className="inline mr-2 muted" />{time(vault.lastHeartbeat)}</dd></div><div className="rule-row"><dt>Next deadline</dt><dd className={vault.expired ? "text-[#BD6D64]" : "text-[#A8C1AF]"}>{time(vault.deadline)}</dd></div><div className="rule-row"><dt>Document proof state</dt><dd>{vault.documentReleased ? "Released on-chain" : "Not released"}</dd></div></dl></section>
  </div>;
}
