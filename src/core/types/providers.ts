/** Typed provider health, surfaced in Settings → Integrations. */
export type ProviderHealthState = "available" | "unavailable" | "not-configured" | "degraded" | "error";

export interface ProviderHealth {
  readonly state: ProviderHealthState;
  /** Short human label, e.g. "Detected · 47 games". */
  readonly summary: string;
  /** Optional detail line. Must never contain secrets or private media paths. */
  readonly detail?: string;
  readonly checkedAt: number;
}

export interface SteamStatus {
  readonly detected: boolean;
  readonly steamPath: string | null;
  readonly libraries: number;
  readonly installedGames: number;
  readonly apiConfigured: boolean;
  readonly steamIdConfigured: boolean;
  readonly malformedManifests: number;
}
