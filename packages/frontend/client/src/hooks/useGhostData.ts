/* Ghost Protocol style: polling is quiet and purposeful; stale state is always labeled. */
import { useCallback, useEffect, useState } from "react";
import { BACKEND_URL, fetchJson, type ContractConfig, type Vault } from "../lib/ghost";

type GhostDataOptions = {
  includeVaults?: boolean;
};

let pendingConfigRequest: Promise<ContractConfig> | null = null;
let pendingVaultsRequest: Promise<{ vaults: Vault[] }> | null = null;

function fetchConfig() {
  if (!pendingConfigRequest) {
    pendingConfigRequest = fetchJson<ContractConfig>("/api/v1/config")
      .finally(() => { pendingConfigRequest = null; });
  }
  return pendingConfigRequest;
}

function fetchVaults() {
  if (!pendingVaultsRequest) {
    pendingVaultsRequest = fetchJson<{ vaults: Vault[] }>("/api/v1/vaults")
      .finally(() => { pendingVaultsRequest = null; });
  }
  return pendingVaultsRequest;
}

export function useGhostData({ includeVaults = true }: GhostDataOptions = {}) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (includeVaults) {
        const [configBody, vaultBody] = await Promise.all([fetchConfig(), fetchVaults()]);
        setConfig(configBody);
        setVaults(vaultBody.vaults);
      } else {
        setConfig(await fetchConfig());
      }
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load protocol state"); }
    finally { setLoading(false); }
  }, [includeVaults]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { vaults, config, loading, error, refresh, backendUrl: BACKEND_URL };
}
