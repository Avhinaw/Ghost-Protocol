/* Ghost Protocol style: vault detail is a calm chain record, with consequences stated before actions. */
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Clock3, Loader2, Radio, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { cancelVaultOnChain, fetchJson, sendHeartbeatOnChain, type ContractConfig, type Vault } from "../lib/ghost";

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

  async function refresh() {
    setLoading(true);
    try { const [record, protocol] = await Promise.all([fetchJson<{ vault: Vault }>(`/api/v1/vaults/${id}`), fetchJson<ContractConfig>("/api/v1/config")]); setVault(record.vault); setConfig(protocol); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read this vault"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [id]);

  async function action(kind: "heartbeat" | "cancel") {
    if (!config?.contractAddress) { toast.error("No contract address available"); return; }
    setBusy(true);
    try { if (kind === "heartbeat") await sendHeartbeatOnChain(config.contractAddress, id); else if (window.confirm("Cancel this active vault? This cannot be undone.")) await cancelVaultOnChain(config.contractAddress, id); toast.success(kind === "heartbeat" ? "Heartbeat recorded" : "Vault cancelled"); await refresh(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Transaction failed"); }
    finally { setBusy(false); }
  }

  if (loading && !vault) return <div className="loading-line" />;
  if (error || !vault) return <div className="empty-state"><h3>Vault record unavailable.</h3><p>{error ?? "No vault was returned for this identifier."}</p><Link href="/"><Button className="button-quiet">Back to register</Button></Link></div>;
  const isActive = vault.stateName === "Active";
  return <div>
    <Link href="/" className="inline-flex items-center gap-2 muted text-sm mb-8"><ArrowLeft size={15} /> Back to operations</Link>
    <div className="detail-layout">
      <section>
        <div className="detail-hero"><div className="eyebrow">Vault / {id.padStart(4, "0")}</div><h1 className="detail-title">Custody record<br /><em className={vault.stateName === "Active" ? "mineral-italic" : vault.stateName === "Triggered" ? "copper" : ""}>{vault.stateName.toLowerCase()}</em>.</h1><p className="detail-subtitle">A public state record for an encrypted payload. The chain can verify the commitment; it cannot read the plaintext.</p></div>
        <div className="detail-actions">{isActive && <Button className="button-primary" disabled={busy} onClick={() => void action("heartbeat")}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />} Send heartbeat</Button>}{isActive && <Button variant="outline" className="button-quiet" disabled={busy} onClick={() => void action("cancel")}><X size={16} /> Cancel vault</Button>}</div>
        <div className="notice mt-6"><span className="status-dot green" /><span><strong>Owner action required.</strong> {isActive ? "Send the next heartbeat before the deadline to keep this record active." : `This record is ${vault.stateName.toLowerCase()}; owner heartbeat actions are closed.`}</span></div>
      </section>
      <aside className="signal-panel"><div className="signal-ring"><Check size={22} className="relative z-10 text-[#A8C1AF]" /></div><span className="signal-label">SIGNAL / {vault.stateName.toUpperCase()}</span></aside>
    </div>
    <section className="panel evidence-panel mt-8"><div className="panel-header"><h2 className="panel-title">Chain record</h2><span className={`state-mark ${vault.stateName.toLowerCase()}`}><span className="status-dot green" />{vault.stateName}</span></div><dl className="rule-list"><div className="rule-row"><dt>Owner</dt><dd className="mono">{short(vault.owner)}</dd></div><div className="rule-row"><dt>Payload CID</dt><dd className="mono">{vault.payloadCid}</dd></div><div className="rule-row"><dt>Payload hash</dt><dd className="mono">{short(vault.payloadHash)}</dd></div><div className="rule-row"><dt>Key commitment</dt><dd className="mono">{short(vault.keyCommitment)}</dd></div><div className="rule-row"><dt>Last heartbeat</dt><dd><Clock3 size={13} className="inline mr-2 muted" />{time(vault.lastHeartbeat)}</dd></div><div className="rule-row"><dt>Next deadline</dt><dd className={vault.expired ? "text-[#BD6D64]" : "text-[#A8C1AF]"}>{time(vault.deadline)}</dd></div><div className="rule-row"><dt>Evidence release</dt><dd>{vault.releaseKeyAvailable ? "Key released" : "Key not released"}</dd></div></dl></section>
  </div>;
}
