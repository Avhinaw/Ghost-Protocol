import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileLock2,
  HeartPulse,
  KeyRound,
  Radio,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useGhostData } from "../hooks/useGhostData";

function shortAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function formatTime(epoch: string) { return new Date(Number(epoch) * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

const features = [
  {
    icon: FileLock2,
    title: "Private by design",
    label: "LOCAL ENCRYPTION",
    copy: "Evidence is encrypted in your browser before its commitment is recorded. Plaintext is never sent to the chain.",
  },
  {
    icon: HeartPulse,
    title: "A living check-in",
    label: "OWNER CONTROL",
    copy: "Choose your check-in interval and grace period. A signed heartbeat keeps an active vault in good standing.",
  },
  {
    icon: UsersRound,
    title: "A human release path",
    label: "HUMAN REVIEW",
    copy: "Trusted-contact management is not available in this prototype. The current reviewer flow requires explicit human review.",
  },
  {
    icon: KeyRound,
    title: "Conditional release",
    label: "MANUAL / TESTNET",
    copy: "Vault state and release proofs are visible on-chain. Automatic release is disabled; use synthetic material only.",
  },
];

export default function Home() {
  const { vaults, config, loading, error, refresh } = useGhostData();
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end end"] });
  const videoScale = useTransform(scrollYProgress, [0, 1], [1, 1.18]);
  const videoY = useTransform(scrollYProgress, [0, 1], [0, -36]);
  const active = vaults.filter((vault) => vault.stateName === "Active").length;
  const triggered = vaults.filter((vault) => vault.stateName === "Triggered").length;
  const released = vaults.filter((vault) => vault.stateName === "Released").length;
  return (
    <div className="home-page">
      <section ref={heroRef} className="hero-layout">
        <div className="hero-stage">
          <div className="hero-visual">
            <motion.div className="hero-video-motion" style={{ scale: prefersReducedMotion ? 1 : videoScale, y: prefersReducedMotion ? 0 : videoY }}>
              <video
                className="hero-video"
                src="/gostProtocoloHero.mp4"
                poster="/gostProtocoloHero-poster.jpg"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="Ghost Protocol cinematic hero video"
              />
            </motion.div>
            <div className="hero-video-shade" aria-hidden="true" />
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-pulse" /> DIGITAL LEGACY INFRASTRUCTURE</div>
              <h1 className="hero-display"><span>What</span><span>matters</span></h1>
              <p>Encrypted evidence. Verifiable check-ins. A deliberate path to release when you can no longer be there.</p>
              <div className="hero-actions">
                <Link href="/create" className="hero-primary-link">Create a vault <ArrowUpRight size={17} /></Link>
                <a href="#protocol" className="hero-secondary-link">Explore the protocol <ArrowDown size={15} /></a>
              </div>
              <div className="hero-proof"><span><Check size={14} /> Browser-side encryption</span><span><Check size={14} /> Verifiable on-chain state</span><span className="prototype-tag">PROTOTYPE / TESTNET</span></div>
            </div>
            <div className="hero-bottom-type" aria-hidden="true"><span>Outlast</span><span>the moment.</span></div>
            <div className="hero-coordinate coordinate-one">CHAIN / {config?.chainId ?? "TESTNET"}</div>
            <div className="hero-film-status"><span className="visual-live"><i /> PROTOCOL STATUS</span><span>{config ? "NODE CONNECTED" : "AWAITING NODE"}</span></div>
          </div>
          <div className="hero-scroll-cue"><span /> SCROLL TO CONTINUE</div>
        </div>
      </section>

      <section id="protocol" className="content-section features-section">
        <div className="section-intro section-intro-row">
          <div><span className="section-kicker">A CLEAR PATH THROUGH THE UNCERTAIN</span><h2>Quiet safeguards.<br /><span>Lasting intent.</span></h2></div>
          <p>Prepare your vault, keep your check-ins visible, and make every release decision deliberate.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, label, copy }, index) => (
            <article className="feature-card glass-card" key={title}>
              <div className="feature-card-top"><span className="feature-index">0{index + 1} / 04</span><span className="feature-icon"><Icon size={19} /></span></div>
              <span className="feature-label">{label}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="security-note"><ShieldCheck size={17} /><span><strong>Security is a practice.</strong> This is a testnet prototype, not a production evidence service. Keep real or sensitive material out of this environment.</span><Link href="/review" className="text-link">Reviewer flow <ArrowUpRight size={14} /></Link></div>
      </section>

      <section id="register" className="content-section dashboard-section">
        <div className="section-intro section-intro-row">
          <div><span className="section-kicker">THE LIVE REGISTER / TESTNET</span><h2>Every vault.<br /><span>One clear signal.</span></h2></div>
          <Button variant="outline" size="sm" className="button-quiet refresh-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh register</Button>
        </div>
        <div className="dashboard-preview glass-card">
          <div className="dashboard-topline"><div><span className="visual-live"><i /> NETWORK REGISTER</span><h3>Operations overview</h3></div><span className="dashboard-chain"><Radio size={13} /> {config ? `CHAIN ${config.chainId}` : "NODE OFFLINE"}</span></div>
          <div className="stat-strip">
            <div className="stat-item"><span className="stat-value">{active}</span><span className="stat-label micro">Active vaults</span></div>
            <div className="stat-item"><span className="stat-value">{triggered}</span><span className="stat-label micro">Awaiting review</span></div>
            <div className="stat-item"><span className="stat-value">{released}</span><span className="stat-label micro">Released records</span></div>
          </div>
          <div className="register-heading"><span>RECENT VAULT ACTIVITY</span><span>LIVE / TESTNET</span></div>
          {error && <div className="notice" role="alert"><span className="status-dot copper" /><span><strong>Backend unavailable.</strong> {error} Set the API URL and contract address in the frontend environment before testing.</span></div>}
          {loading && !vaults.length ? <div className="loading-line" /> : vaults.length === 0 ? (
            <div className="empty-state"><h3>No vaults on this register.</h3><p>The chain is quiet. Create a synthetic test vault to see its heartbeat, deadline, and state here.</p><Link href="/create"><Button className="button-primary">Open a new vault <ArrowUpRight size={16} /></Button></Link></div>
          ) : (
            <div className="vault-grid">{vaults.slice(0, 5).map((vault) => <Link key={vault.id} href={`/vault/${vault.id}`} className="vault-row"><span className="vault-id">#{vault.id}</span><span><span className="micro vault-field-label block mb-1">OWNER</span><span className="vault-owner">{shortAddress(vault.owner)}</span><span className="micro vault-field-label block mt-2">PAYLOAD / <span className="vault-cid">{vault.payloadCid}</span></span></span><span className={`state-mark ${vault.stateName.toLowerCase()}`}><span className={`status-dot ${vault.stateName === "Active" ? "green" : vault.stateName === "Triggered" ? "copper" : ""}`} />{vault.stateName}</span><span className="vault-meta"><span className="micro block mb-1">Deadline</span>{formatTime(vault.deadline)}</span><span className="vault-meta text-right"><ArrowUpRight size={15} /></span></Link>)}</div>
          )}
          <div className="dashboard-bottom"><span>Deadlines are shown in your local time</span><Link href="/create" className="text-link">Create a vault <ArrowRight size={15} /></Link></div>
        </div>
      </section>
    </div>
  );
}
