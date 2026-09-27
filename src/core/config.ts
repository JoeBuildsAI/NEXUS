/**
 * NEXUS runtime configuration.
 *
 * Controls which provider implementations are used (mock vs. real) and other
 * environment-driven behavior. Defaults are safe for the development laptop:
 * everything runs against high-quality mock/demo providers and no privileged
 * system operations are performed.
 */

export type ProviderMode = "mock" | "real" | "auto";

export interface NexusConfig {
  /** Whether the app is running inside a Tauri shell (vs. plain browser dev). */
  readonly isTauri: boolean;
  /** Global demo mode — forces mock providers and demo data everywhere. */
  readonly demoMode: boolean;
  /** Per-domain provider selection. */
  readonly providers: {
    readonly system: ProviderMode;
    readonly steam: ProviderMode;
    readonly media: ProviderMode;
    readonly email: ProviderMode;
    readonly assistant: ProviderMode;
  };
  /**
   * Safety posture for process/system mutations. On the dev laptop this is
   * "observe" — NEXUS never terminates or suspends anything automatically.
   */
  readonly systemSafety: "observe" | "enabled";
}

function envFlag(key: string, fallback: boolean): boolean {
  const raw = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  if (raw == null) return fallback;
  return raw === "true" || raw === "1";
}

function envProvider(key: string, fallback: ProviderMode): ProviderMode {
  const raw = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  if (raw === "mock" || raw === "real" || raw === "auto") return raw;
  return fallback;
}

const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

// Demo mode defaults ON unless explicitly disabled. This guarantees the app
// looks impressive on the development laptop with zero integrations.
const demoMode = envFlag("VITE_DEMO_MODE", true);

export const config: NexusConfig = {
  isTauri,
  demoMode,
  providers: {
    // Real system telemetry is safe and desirable, so prefer it whenever running
    // under Tauri — even in demo mode. Other domains default to mock demo data.
    system: envProvider("VITE_PROVIDER_SYSTEM", isTauri ? "auto" : "mock"),
    steam: envProvider("VITE_PROVIDER_STEAM", "mock"),
    media: envProvider("VITE_PROVIDER_MEDIA", isTauri && !demoMode ? "auto" : "mock"),
    email: envProvider("VITE_PROVIDER_EMAIL", "mock"),
    assistant: envProvider("VITE_PROVIDER_ASSISTANT", "mock"),
  },
  systemSafety: (import.meta.env.VITE_SYSTEM_SAFETY as "observe" | "enabled") || "observe",
};
