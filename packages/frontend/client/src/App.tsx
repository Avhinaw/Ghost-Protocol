import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { ArrowUpRight, Radio } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import LocomotiveScroll from "locomotive-scroll";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CreateVault from "./pages/CreateVault";
import VaultDetail from "./pages/VaultDetail";
import ReviewerConsole from "./pages/ReviewerConsole";
import { BrandMark } from "./components/BrandMark";
import { RadialMenu } from "./components/RadialMenu";
import { LoadingScreen } from "./components/LoadingScreen";
import { connectWallet } from "./lib/ghost";
import { toast } from "sonner";

function AppShell() {
  const [location] = useLocation();
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const locomotiveScroll = useRef<LocomotiveScroll | null>(null);
  const revealUpdater = useRef<(() => void) | null>(null);
  const pageName = location === "/create" ? "New vault" : location === "/review" ? "Reviewer console" : location.startsWith("/vault/") ? "Vault detail" : "Operations";

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const scroll = new LocomotiveScroll({
      lenisOptions: {
        lerp: 0.085,
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 0.85,
      },
      scrollCallback: () => {
        ScrollTrigger.update();
        revealUpdater.current?.();
      },
    });
    locomotiveScroll.current = scroll;

    return () => {
      scroll.destroy();
      locomotiveScroll.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const appShell = document.querySelector(".app-shell");
    if (!appShell) return;

    if (locomotiveScroll.current) {
      locomotiveScroll.current.scrollTo(0, { immediate: true, force: true });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    let lastScrollY = window.scrollY;
    let scrollDirection = 1;
    let revealFrame = 0;
    let updateReveals: (() => void) | null = null;
    const animations = new Map<Element, gsap.core.Tween>();
    const visibility = new Map<Element, boolean>();

    const context = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const textElements = gsap.utils
        .toArray<HTMLElement>(".workspace-content h1, .workspace-content h2, .workspace-content h3, .workspace-content .section-kicker, .workspace-content .detail-subtitle, .workspace-content .section-intro-row > p")
        .filter((element) => !element.matches(".hero-display, .hero-story-beat h2") && !element.closest("[data-scroll-reveal]"));
      const revealElements = [
        ...gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]"),
        ...textElements,
      ];
      const blockRevealCount = revealElements.length - textElements.length;
      const animate = (element: Element, isVisible: boolean) => {
        if (visibility.get(element) === isVisible) return;
        visibility.set(element, isVisible);
        animations.get(element)?.kill();
        const elementIndex = revealElements.indexOf(element as HTMLElement);
        const isBlockReveal = elementIndex < blockRevealCount;
        const y = isVisible ? 0 : isBlockReveal ? 24 : 18;
        const tween = gsap.to(element, {
          autoAlpha: isVisible ? 1 : 0,
          y,
          duration: isBlockReveal ? 0.65 : 0.55,
          ease: "power2.out",
        });
        animations.set(element, tween);
      };

      revealElements.forEach((element) => {
        const index = revealElements.indexOf(element);
        const isBlockReveal = index < blockRevealCount;
        gsap.set(element, { autoAlpha: 0, y: isBlockReveal ? 24 : 18 });
        visibility.set(element, false);
      });

      const entranceElements = revealElements.filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top < window.innerHeight * 0.9 && bounds.bottom > 0;
      });
      entranceElements.forEach((element, index) => {
        const isBlockReveal = revealElements.indexOf(element) < blockRevealCount;
        visibility.set(element, true);
        const tween = gsap.to(element, {
          autoAlpha: 1,
          y: 0,
          duration: isBlockReveal ? 0.65 : 0.55,
          delay: index * 0.08,
          ease: "power2.out",
        });
        animations.set(element, tween);
      });

      updateReveals = () => {
        if (revealFrame) return;
        revealFrame = requestAnimationFrame(() => {
          revealFrame = 0;
          const currentScrollY = window.scrollY;
          if (currentScrollY !== lastScrollY) scrollDirection = Math.sign(currentScrollY - lastScrollY);
          lastScrollY = currentScrollY;

          revealElements.forEach((element) => {
            const bounds = element.getBoundingClientRect();
            if (scrollDirection >= 0 && bounds.top < window.innerHeight * 0.9 && bounds.bottom > 0) {
              animate(element, true);
            } else if (scrollDirection < 0 && bounds.top >= window.innerHeight * 0.9) {
              animate(element, false);
            }
          });
        });
      };
      revealUpdater.current = updateReveals;
      window.addEventListener("scroll", updateReveals, { passive: true });
      updateReveals();
    }, appShell);

    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(refreshFrame);
      if (revealFrame) cancelAnimationFrame(revealFrame);
      if (updateReveals) window.removeEventListener("scroll", updateReveals);
      if (revealUpdater.current === updateReveals) revealUpdater.current = null;
      animations.forEach((animation) => animation.kill());
      visibility.clear();
      context.revert();
    };
  }, [location]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const result = await connectWallet();
      setWallet(result.address);
      toast.success("Wallet connected", { description: `${result.address.slice(0, 6)}…${result.address.slice(-4)}` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  return <div className="app-shell">
    <main className="workspace">
      <header className={`topbar topbar-wallet${location === "/" ? " topbar-wallet-home" : ""}`}>
        <button className="wallet-button wallet-button-mobile" onClick={handleConnect} disabled={connecting}>
          <span className={wallet ? "status-dot green" : "status-dot"} />
          {connecting ? "Connecting…" : wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
          <ArrowUpRight size={14} />
        </button>
      </header>
      <div className={`workspace-content${location === "/" ? " workspace-content-home" : ""}`}><Router wallet={wallet} connecting={connecting} onConnect={handleConnect} /></div>
      <footer className="workspace-footer" data-scroll-reveal>
        <span>Ghost Protocol <i>/</i> encrypted evidence infrastructure</span>
        <span className="mono">PROTOTYPE / TESTNET ONLY · USE SYNTHETIC MATERIAL</span>
      </footer>
    </main>
    <aside className="rail rail-right">
      <Link href="/" className="brand-lockup" aria-label="Ghost Protocol operations home"><BrandMark /></Link>
      <RadialMenu />
      <div className="rail-wallet">
        <button className="wallet-button wallet-button-sidebar" onClick={handleConnect} disabled={connecting}>
          <span className={wallet ? "status-dot green" : "status-dot"} />
          <span>{connecting ? "Connecting…" : wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</span>
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="rail-bottom">
        <div className="rail-note" title="Local chain ready"><span className="status-dot green" /><span className="rail-label">Local services only</span></div>
        <div className="rail-chain"><Radio size={14} /><span className="rail-label">CHAIN / 31337</span></div>
      </div>
    </aside>
  </div>;
}
function Router({ wallet, connecting, onConnect }: { wallet: string | null; connecting: boolean; onConnect: () => void }) { return <Switch><Route path="/" component={() => <Home wallet={wallet} connecting={connecting} onConnect={onConnect} />} /><Route path="/create" component={CreateVault} /><Route path="/review" component={ReviewerConsole} /><Route path="/vault/:id" component={VaultDetail} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() {
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);
  if (booting) return <LoadingScreen />;
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster position="bottom-right" /><AppShell /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
