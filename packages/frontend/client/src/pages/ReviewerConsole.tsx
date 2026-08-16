import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { AlertTriangle, CheckCircle2, FileScan, KeyRound, Loader2, LockKeyhole, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { FALLBACK_CONTRACT, releaseVaultOnChain } from "../lib/ghost";

type Assessment = {
  assessment_hash: string;
  decision: string;
  confidence_score: number;
  document_type: string;
  subject_name: string;
  registration_hash: string;
  summary: string;
  reasons: string[];
  risk_flags: string[];
  auto_release_allowed: false;
  requires_human_review: true;
};

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) value += String.fromCharCode(bytes[index] ?? 0);
  return btoa(value);
}

export default function ReviewerConsole() {
  const { user, loading, isAuthenticated } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [vaultId, setVaultId] = useState("1");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [releaseKey, setReleaseKey] = useState("");
  const [releaseHash, setReleaseHash] = useState("");
  const [contractAddress, setContractAddress] = useState(FALLBACK_CONTRACT);
  const status = trpc.reviewer.status.useQuery(undefined, { enabled: isAuthenticated });
  const localReviewerSignIn = trpc.auth.localReviewerSignIn.useMutation();
  const assess = trpc.reviewer.assessDocument.useMutation();
  const approve = trpc.reviewer.approve.useMutation();
  const reject = trpc.reviewer.reject.useMutation();
  const localServicesAvailable = status.data?.available ?? false;
  const readyForApproval = assessment?.decision === "HUMAN_REVIEW_REQUIRED" && acknowledged && !approved && !rejected;
  const confidence = useMemo(() => assessment ? Math.round(assessment.confidence_score * 100) : 0, [assessment]);

  useEffect(() => {
    if (status.data?.contractAddress) setContractAddress((current: string) => current || status.data.contractAddress);
  }, [status.data?.contractAddress]);

  async function uploadDocument() {
    if (!file) return toast.error("Choose a synthetic document first.");
    try {
      const result = await assess.mutateAsync({ fileName: file.name, mimeType: file.type || "application/octet-stream", base64: toBase64(await file.arrayBuffer()) });
      setAssessment(result.assessment as Assessment);
      setApproved(false);
      setRejected(false);
      setAcknowledged(false);
      setReleaseHash("");
      toast.success("Assessment stored", { description: "Human review is still required." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document could not be assessed");
    }
  }

  async function enterLocalReviewerMode() {
    try {
      await localReviewerSignIn.mutateAsync();
      window.location.assign("/review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Local reviewer mode could not be started.");
    }
  }

  async function approveAssessment() {
    if (!assessment) return;
    try {
      const result = await approve.mutateAsync({ vaultId, assessmentHash: assessment.assessment_hash });
      setApproved(true);
      toast.success("Manual review recorded", { description: `Oracle transaction: ${String(result.hash).slice(0, 12)}…` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review could not be submitted");
    }
  }

  async function rejectAssessment() {
    if (!assessment) return;
    try {
      await reject.mutateAsync({ assessmentHash: assessment.assessment_hash, reason: "Reviewer rejected the synthetic assessment during local testing." });
      setRejected(true);
      setApproved(false);
      toast.success("Assessment rejected", { description: "No oracle call was made." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection could not be recorded");
    }
  }

  async function releaseVault() {
    if (!contractAddress) return toast.error("Enter the local contract address.");
    if (!releaseKey) return toast.error("Enter the matching local release key.");
    try {
      const receipt = await releaseVaultOnChain(contractAddress, vaultId, new TextEncoder().encode(releaseKey));
      setReleaseHash(receipt.hash);
      toast.success("Vault released", { description: `${receipt.hash.slice(0, 12)}…` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Release key was not accepted");
    }
  }

  if (loading) return <div className="loading-line" />;
  if (!isAuthenticated) return <div className="review-auth"><LockKeyhole size={22} /><h1>Reviewer access is protected.</h1><p>For this local prototype, start a development-only reviewer session. It never grants production access or exposes the oracle approval token.</p><div className="review-auth-actions"><Button className="button-primary" onClick={enterLocalReviewerMode} disabled={localReviewerSignIn.isPending}>{localReviewerSignIn.isPending ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}Enter local reviewer mode</Button><Button className="button-quiet" onClick={() => startLogin()}>Sign in with Manus</Button></div></div>;

  return <div className="review-layout">
    <section className="review-hero">
      <div><div className="eyebrow">Reviewer console / local only</div><h1 className="detail-title">Decide deliberately. Release only with proof.</h1><p className="detail-subtitle">Signed in as <strong>{user?.name ?? "reviewer"}</strong>. This console talks only to localhost services and accepts synthetic material for testing.</p></div>
      <div className="review-status panel"><div className="panel-header"><h2 className="panel-title">Local bridge</h2><span className="micro copper">DEV / ONLY</span></div><dl className="rule-list"><div className="rule-row"><dt>Oracle</dt><dd>{localServicesAvailable ? "Connected" : status.isLoading ? "Checking" : "Local runtime required"}</dd></div><div className="rule-row"><dt>Chain</dt><dd>{status.data?.chainId ?? "—"}</dd></div><div className="rule-row"><dt>Auto release</dt><dd>Disabled</dd></div></dl></div>
    </section>
    {!status.isLoading && !localServicesAvailable && <div className="notice"><AlertTriangle size={17} /><span><strong>Local testing boundary.</strong> {status.data?.reason ?? "Start the local chain, AI verifier, and Node oracle, then use the development preview. The published portfolio site cannot access sandbox-local services."}</span></div>}
    <section className="review-steps" aria-label="Review steps"><span className={assessment ? "step done" : "step active"}>01 / Evidence</span><span className={approved ? "step done" : assessment ? "step active" : "step"}>02 / Human review</span><span className={releaseHash ? "step done" : approved ? "step active" : "step"}>03 / Manual release</span></section>
    <section className="review-grid">
      <div className="form-sheet review-upload"><div className="eyebrow">01 / Evidence intake</div><h2>Upload a test document.</h2><p className="form-intro">The file is sent through the protected local bridge to the AI verifier. It is not a release command.</p><div className="file-drop"><label className="micro">Synthetic evidence file</label><input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file && <div className="file-name">{file.name} / {(file.size / 1024).toFixed(1)} KB</div>}</div><div className="field"><label>Local vault ID</label><input value={vaultId} onChange={(event) => setVaultId(event.target.value.replace(/\D/g, ""))} inputMode="numeric" /></div><Button className="button-primary mt-6" onClick={uploadDocument} disabled={!file || !localServicesAvailable || assess.isPending}><Upload size={16} />{assess.isPending ? "Assessing…" : localServicesAvailable ? "Send for AI assessment" : "Use development preview"}</Button></div>
      <div className="panel review-assessment"><div className="panel-header"><h2 className="panel-title">AI assessment</h2><span className="micro copper">READ / ONLY</span></div>{!assessment ? <div className="review-empty"><FileScan size={28} /><p>{localServicesAvailable ? "Upload a synthetic document to create a reviewable assessment." : "The hosted portfolio view does not call sandbox-local AI services."}</p></div> : <div className="assessment-body"><div className="assessment-decision"><span className="status-dot copper" /><div><span className="micro">Decision</span><strong>{assessment.decision.replaceAll("_", " ")}</strong></div><span className="confidence">{confidence}%</span></div><dl className="rule-list"><div className="rule-row"><dt>Document type</dt><dd>{assessment.document_type}</dd></div><div className="rule-row"><dt>Subject</dt><dd>{assessment.subject_name}</dd></div><div className="rule-row"><dt>Registration</dt><dd>{assessment.registration_hash || "Not extracted"}</dd></div><div className="rule-row"><dt>Assessment hash</dt><dd className="mono hash">{assessment.assessment_hash}</dd></div></dl><div className="assessment-note"><strong>Model note</strong><p>{assessment.summary}</p>{assessment.risk_flags.map((flag) => <span className="risk-flag" key={flag}>{flag}</span>)}</div></div>}</div>
    </section>
    <section className="review-grid review-actions"><div className="panel approval-panel"><div className="panel-header"><h2 className="panel-title">02 / Human review</h2><ShieldCheck size={18} className="copper" /></div><div className="action-well"><p>The AI cannot trigger a release by itself. Check the assessment independently, then record your explicit approval for this local test.</p><label className="approval-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I independently reviewed this synthetic assessment and approve the local oracle trigger.</span></label><div className="review-decision-actions"><Button className="button-primary" onClick={approveAssessment} disabled={!readyForApproval || !localServicesAvailable || approve.isPending}>{approve.isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}{approved ? "Trigger recorded" : "Approve & trigger vault"}</Button><Button className="button-quiet" onClick={rejectAssessment} disabled={!assessment || approved || rejected || reject.isPending}>{rejected ? "Assessment rejected" : "Reject / no trigger"}</Button></div>{approved && <div className="notice mt-4"><span className="status-dot green" /><span><strong>Triggered.</strong> The vault can now accept its matching release key.</span></div>}{rejected && <div className="notice mt-4 review-rejected"><span className="status-dot copper" /><span><strong>Rejected.</strong> The review was recorded locally and the oracle was not called.</span></div>}</div></div><div className="evidence-panel panel release-panel"><div className="panel-header"><h2 className="panel-title">03 / Manual release</h2><KeyRound size={18} /></div><div className="release-body"><p className="muted">Use the local key that was committed when this test vault was created. The key goes from your wallet directly to the local contract.</p><div className="field"><label>Local contract address</label><input value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} placeholder="0x…" /></div><div className="field"><label>Matching release key</label><input value={releaseKey} onChange={(event) => setReleaseKey(event.target.value)} placeholder="Local test key" type="password" /></div><Button className="button-primary mt-6" onClick={releaseVault} disabled={!approved || !localServicesAvailable}><KeyRound size={16} />Submit release key</Button>{releaseHash && <div className="release-success"><CheckCircle2 size={17} />Released locally / {releaseHash.slice(0, 16)}…</div>}</div></div></section>
    <div className="notice"><AlertTriangle size={17} /><span><strong>Development boundary.</strong> Do not upload real documents, use a real wallet, or reuse the local reviewer token. Production needs durable audit logs, authenticated reviewer roles, secure key custody, and hosted services.</span></div>
  </div>;
}
