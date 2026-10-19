import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { Radio } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CreateVault from "./pages/CreateVault";
import VaultDetail from "./pages/VaultDetail";
import ReviewerConsole from "./pages/ReviewerConsole";
import { BrandMark } from "./components/BrandMark";
import { ThreatAnimation } from "./components/ThreatAnimation";
import { RadialMenu } from "./components/RadialMenu";
import { LiquidDroplets } from "./components/LiquidDroplets";
import { connectWallet } from "./lib/ghost";
import { toast } from "sonner";

function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const pageName = location === "/create" ? "New vault" : location === "/review" ? "Reviewer console" : location.startsWith("/vault/") ? "Vault detail" : "Operations";
  async function handleConnect() { setConnecting(true); try { const result = await connectWallet(); setWallet(result.address); toast.success("Wallet connected", { description: `${result.address.slice(0, 6)}…${result.address.slice(-4)}` }); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not connect wallet"); } finally { setConnecting(false); } }
  return <div className="app-shell"><LiquidDroplets /><ThreatAnimation /><main className="workspace"><header className="topbar"><div className="topbar-path"><span className="mono micro copper">GHOST / 01</span><span className="slash">/</span><span>{pageName}</span></div><button className="wallet-button" onClick={handleConnect} disabled={connecting}><span className={wallet ? "status-dot green" : "status-dot"} />{connecting ? "Connecting…" : wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</button></header><div className="workspace-content">{children}</div><footer className="workspace-footer"><span>Ghost Protocol / encrypted evidence infrastructure</span><span className="mono">NOT FOR REAL EVIDENCE · TESTNET ONLY</span></footer></main><aside className="rail rail-right"><Link href="/" className="brand-lockup" aria-label="Ghost Protocol operations home"><BrandMark /><span className="brand-wordmark">GHOST <i>/</i> PROTOCOL</span></Link><RadialMenu /><div className="rail-bottom"><div className="rail-note" title="Local chain ready"><span className="status-dot green" /><span className="rail-label">Local services only</span></div><div className="rail-chain"><Radio size={14} /><span className="rail-label">CHAIN / 31337</span></div></div></aside></div>;
}
function Router() { return <Switch><Route path="/" component={Home} /><Route path="/create" component={CreateVault} /><Route path="/review" component={ReviewerConsole} /><Route path="/vault/:id" component={VaultDetail} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster position="bottom-right" /><AppShell><Router /></AppShell></TooltipProvider></ThemeProvider></ErrorBoundary>; }
