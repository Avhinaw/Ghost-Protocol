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
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef, useState } from "react";
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

interface HomeProps {
  wallet: string | null;
  connecting: boolean;
  onConnect: () => void;
}

export default function Home({ wallet, connecting, onConnect }: HomeProps) {
  const { vaults, config, loading, error, refresh } = useGhostData();
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const cursorX = useSpring(-100, { stiffness: 260, damping: 28, mass: 0.35 });
  const cursorY = useSpring(-100, { stiffness: 260, damping: 28, mass: 0.35 });
  const ctaX = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.35 });
  const ctaY = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.35 });
  const videoRotateX = useSpring(useMotionValue(0), { stiffness: 120, damping: 24, mass: 0.6 });
  const videoRotateY = useSpring(useMotionValue(0), { stiffness: 120, damping: 24, mass: 0.6 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end end"] });
  const videoScale = useTransform(scrollYProgress, [0, 0.38, 1], [0.48, 1, 1.06]);
  const videoY = useTransform(scrollYProgress, [0, 1], [0, -18]);
  const heroExitProgress = useSpring(useTransform(scrollYProgress, [0.9, 1], [0, 1]), { stiffness: 55, damping: 28, mass: 1 });
  const heroExitY = useTransform(heroExitProgress, [0, 1], ["0vh", "-110vh"]);
  const heroExitScale = useTransform(heroExitProgress, [0, 1], [1, 0.68]);
  const heroExitRotateX = useTransform(heroExitProgress, [0, 1], [0, 32]);
  const heroExitRotateZ = useTransform(heroExitProgress, [0, 1], [0, -4]);
  const heroExitOpacity = useTransform(heroExitProgress, [0.55, 1], [1, 0]);
  const heroExitClip = useTransform(
    heroExitProgress,
    [0, 1],
    [
      "polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, 0 0, 0 0, 0 0)",
      "polygon(12% 0, 88% 0, 100% 22%, 100% 100%, 88% 100%, 12% 100%, 0 78%, 0 22%)",
    ],
  );
  const videoClip = useTransform(
    scrollYProgress,
    [0, 0.38, 1],
    [
      "polygon(17% 8%, 83% 8%, 92% 18%, 92% 82%, 83% 92%, 17% 92%, 8% 82%, 8% 18%)",
      "polygon(0 0, 100% 0, 100% 0, 100% 100%, 100% 100%, 0 100%, 0 100%, 0 0)",
      "polygon(0 0, 100% 0, 100% 0, 100% 100%, 100% 100%, 0 100%, 0 100%, 0 0)",
    ],
  );
  const videoGeometryOpacity = useTransform(scrollYProgress, [0, 0.24, 0.38], [1, 0.8, 0]);
  const leftFacetX = useTransform(scrollYProgress, [0, 0.2, 0.38], ["0%", "0%", "-110%"]);
  const rightFacetX = useTransform(scrollYProgress, [0, 0.2, 0.38], ["0%", "0%", "110%"]);
  const chapterOneOpacity = useTransform(scrollYProgress, [0.18, 0.26, 0.45, 0.51], [0, 1, 1, 0]);
  const chapterTwoOpacity = useTransform(scrollYProgress, [0.44, 0.52, 0.69, 0.76], [0, 1, 1, 0]);
  const chapterThreeOpacity = useTransform(scrollYProgress, [0.68, 0.77, 1], [0, 1, 1]);
  const chapterOneY = useTransform(scrollYProgress, [0.18, 0.26], [24, 0]);
  const chapterTwoY = useTransform(scrollYProgress, [0.44, 0.52], [24, 0]);
  const chapterThreeY = useTransform(scrollYProgress, [0.68, 0.77], [24, 0]);
  const introOpacity = useTransform(scrollYProgress, [0.16, 0.26, 0.36], [1, 0.65, 0]);
  const active = vaults.filter((vault) => vault.stateName === "Active").length;
  const triggered = vaults.filter((vault) => vault.stateName === "Triggered").length;
  const released = vaults.filter((vault) => vault.stateName === "Released").length;
  return (
    <div className="home-page">
      <section ref={heroRef} className="hero-layout">
        <div
          className="hero-stage"
          onPointerMove={(event) => {
            if (event.pointerType !== "mouse" || prefersReducedMotion) return;
            cursorX.set(event.clientX - 36);
            cursorY.set(event.clientY - 36);
            setCursorVisible(true);
            const rect = event.currentTarget.getBoundingClientRect();
            const visual = event.currentTarget.querySelector<HTMLElement>(".hero-visual");
            if (visual) {
              const visualRect = visual.getBoundingClientRect();
              const pointerX = Math.max(-0.5, Math.min(0.5, (event.clientX - visualRect.left) / visualRect.width - 0.5));
              const pointerY = Math.max(-0.5, Math.min(0.5, (event.clientY - visualRect.top) / visualRect.height - 0.5));
              videoRotateX.set(pointerY * -8);
              videoRotateY.set(pointerX * 10);
            }
            visual?.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
            visual?.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
          }}
          onPointerLeave={() => {
            setCursorVisible(false);
            videoRotateX.set(0);
            videoRotateY.set(0);
          }}
        >
          <button className="wallet-button hero-wallet" onClick={onConnect} disabled={connecting}>
            <span className={wallet ? "status-dot green" : "status-dot"} />
            {connecting ? "Connecting…" : wallet ? shortAddress(wallet) : "Connect wallet"}
            <ArrowUpRight size={14} />
          </button>
          <motion.div
            className="hero-visual"
            style={{
              y: prefersReducedMotion ? 0 : heroExitY,
              scale: prefersReducedMotion ? 1 : heroExitScale,
              rotateX: prefersReducedMotion ? 0 : heroExitRotateX,
              rotateZ: prefersReducedMotion ? 0 : heroExitRotateZ,
              opacity: prefersReducedMotion ? 1 : heroExitOpacity,
              clipPath: prefersReducedMotion ? "none" : heroExitClip,
            }}
          >
            <motion.div className="hero-video-motion" style={{ scale: prefersReducedMotion ? 1 : videoScale, y: prefersReducedMotion ? 0 : videoY, rotateX: prefersReducedMotion ? 0 : videoRotateX, rotateY: prefersReducedMotion ? 0 : videoRotateY, clipPath: prefersReducedMotion ? "none" : videoClip }}>
              <video
                className="hero-video"
                src="/gostProtocoloHero.mp4"
                poster="/gostProtocoloHero-poster.jpg"
                muted
                playsInline
                autoPlay={!prefersReducedMotion}
                loop
                preload="auto"
                aria-label="Ghost Protocol video story: preserve, check in, and release"
              />
              <motion.svg
                className="hero-video-geometry"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{ opacity: prefersReducedMotion ? 0 : videoGeometryOpacity }}
              >
                <polygon className="hero-video-geometry-fill" points="170,80 500,80 330,330" />
                <polygon className="hero-video-geometry-fill" points="830,80 670,330 500,80" />
                <polygon className="hero-video-geometry-fill" points="170,920 330,670 500,920" />
                <polygon className="hero-video-geometry-fill" points="830,920 500,920 670,670" />
                <polygon className="hero-video-geometry-outline" points="170,80 830,80 920,180 920,820 830,920 170,920 80,820 80,180" />
                <polygon className="hero-video-geometry-outline hero-video-geometry-inner" points="500,245 755,500 500,755 245,500" />
                <path className="hero-video-geometry-line" d="M170 80 500 245 830 80 M920 180 755 500 920 820 M830 920 500 755 170 920 M80 820 245 500 80 180" />
                <path className="hero-video-geometry-line" d="M500 80 500 245 M920 500 755 500 M500 920 500 755 M80 500 245 500" />
              </motion.svg>
            </motion.div>
            <div className="hero-video-shade" aria-hidden="true" />
            {!prefersReducedMotion && (
              <div className="hero-geometry" aria-hidden="true">
                <motion.div className="hero-geometry-facet hero-geometry-facet-left" style={{ x: leftFacetX }} />
                <motion.div className="hero-geometry-facet hero-geometry-facet-right" style={{ x: rightFacetX }} />
              </div>
            )}
            <motion.div className="hero-copy" style={{ opacity: prefersReducedMotion ? 1 : introOpacity }}>
              <h1 className="hero-display">
                <motion.span initial={prefersReducedMotion ? false : { opacity: 0, y: 42, rotateX: -35 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.9, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}>What</motion.span>
                <motion.span initial={prefersReducedMotion ? false : { opacity: 0, y: 42, rotateX: -35 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.9, delay: 0.24, ease: [0.23, 1, 0.32, 1] }}>matters</motion.span>
              </h1>
              <div className="hero-actions">
                <motion.div className="hero-magnetic-wrap" style={{ x: ctaX, y: ctaY }}>
                  <Link
                    href="/create"
                    className="hero-primary-link"
                    onPointerMove={(event) => {
                      if (event.pointerType === "touch" || prefersReducedMotion) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      ctaX.set((event.clientX - rect.left - rect.width / 2) * 0.16);
                      ctaY.set((event.clientY - rect.top - rect.height / 2) * 0.2);
                    }}
                    onPointerLeave={() => {
                      ctaX.set(0);
                      ctaY.set(0);
                    }}
                  >Create a vault <ArrowUpRight size={17} /></Link>
                </motion.div>
              </div>
            </motion.div>
            <div className="hero-story" aria-label="How Ghost Protocol protects your digital legacy">
              <motion.div className="hero-story-beat" style={{ opacity: prefersReducedMotion ? 1 : chapterOneOpacity, y: prefersReducedMotion ? 0 : chapterOneY }}>
                <span>01 / PRESERVE</span><h2>Keep what matters.</h2><p>Encrypt your evidence before it leaves your browser.</p>
              </motion.div>
              <motion.div className="hero-story-beat" style={{ opacity: prefersReducedMotion ? 0 : chapterTwoOpacity, y: prefersReducedMotion ? 0 : chapterTwoY }}>
                <span>02 / CHECK IN</span><h2>Stay present.</h2><p>A verifiable heartbeat keeps your wishes current.</p>
              </motion.div>
              <motion.div className="hero-story-beat" style={{ opacity: prefersReducedMotion ? 0 : chapterThreeOpacity, y: prefersReducedMotion ? 0 : chapterThreeY }}>
                <span>03 / RELEASE</span><h2>Only with intent.</h2><p>Every release follows a deliberate, human-reviewed path.</p>
              </motion.div>
            </div>
            <div className="hero-coordinate coordinate-one">CHAIN / {config?.chainId ?? "TESTNET"}</div>
            <div className="hero-film-status"><span className="visual-live"><i /> PROTOCOL STATUS</span><span>{config ? "NODE CONNECTED" : "AWAITING NODE"}</span></div>
          </motion.div>
          {!prefersReducedMotion && (
            <motion.div className="hero-cursor" aria-hidden="true" style={{ x: cursorX, y: cursorY, opacity: cursorVisible ? 1 : 0 }}>
              <span>SCROLL</span><ArrowDown size={15} /><span>TO EXPLORE</span>
            </motion.div>
          )}
        </div>
      </section>

      <section id="register" className="content-section dashboard-section" data-scroll-reveal>
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
