/* Ghost Protocol style: polling is quiet and purposeful; stale state is always labeled. */
import { useCallback, useEffect, useState } from "react";
import { BACKEND_URL, fetchJson, type ContractConfig, type Vault } from "../lib/ghost";

export function useGhostData() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [configBody, vaultBody] = await Promise.all([
        fetchJson<ContractConfig>("/api/v1/config"),
        fetchJson<{ vaults: Vault[] }>("/api/v1/vaults"),
      ]);
      setConfig(configBody); setVaults(vaultBody.vaults); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load protocol state"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 12000); return () => window.clearInterval(timer); }, [refresh]);
  return { vaults, config, loading, error, refresh, backendUrl: BACKEND_URL };
}
