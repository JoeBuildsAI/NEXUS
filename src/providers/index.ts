import { config } from "@/core/config";
import type { SystemProvider } from "./system/SystemProvider";
import { MockSystemProvider } from "./system/MockSystemProvider";
import { TauriSystemProvider } from "./system/TauriSystemProvider";
import type { SteamProvider } from "./steam/SteamProvider";
import { MockSteamProvider } from "./steam/MockSteamProvider";
import { RealSteamProvider } from "./steam/RealSteamProvider";
import { SteamAutoProvider } from "./steam/SteamAutoProvider";
import { TauriSteamBridge } from "./steam/SteamBridge";
import type { MediaProvider } from "./media/MediaProvider";
import { MockMediaProvider } from "./media/MockMediaProvider";
import { LocalMediaProvider } from "./media/LocalMediaProvider";
import { MediaAutoProvider } from "./media/MediaAutoProvider";
import { TauriMediaBridge } from "./media/MediaBridge";
import type { EmailProvider } from "./email/EmailProvider";
import { MockEmailProvider } from "./email/MockEmailProvider";
import type { AssistantProvider } from "./assistant/AssistantProvider";
import { LocalCommandProvider } from "./assistant/LocalCommandProvider";
import type { AppProvider } from "./apps/AppProvider";
import { MockAppProvider } from "./apps/MockAppProvider";
import { TauriAppProvider } from "./apps/TauriAppProvider";

/**
 * Central provider factory.
 *
 * Under Tauri, real providers are used wherever the machine supports them:
 *   system  → real telemetry/processes/startup
 *   apps    → Start Menu discovery
 *   steam   → real discovery when Steam is detected, demo library otherwise
 *   media   → real once a folder is authorized, demo library until then
 *   email   → mock (adapters come later)
 * Env overrides (VITE_PROVIDER_*) force "mock" or "real" per domain; "auto" is
 * the default described above. Demo fallback is disabled when VITE_DEMO_MODE=false.
 */

export interface Providers {
  readonly system: SystemProvider;
  readonly steam: SteamProvider;
  readonly media: MediaProvider;
  readonly email: EmailProvider;
  readonly apps: AppProvider;
  readonly assistant: AssistantProvider;
}

let cached: Providers | null = null;

export function getProviders(): Providers {
  if (cached) return cached;
  const tauri = config.isTauri;
  const demoFallback = config.demoMode;

  // System
  const systemMode = config.providers.system;
  const system: SystemProvider = systemMode === "mock" || (!tauri && systemMode !== "real") ? new MockSystemProvider() : new TauriSystemProvider();

  // Steam
  const steamMode = config.providers.steam;
  let steam: SteamProvider;
  if (steamMode === "mock" || !tauri) steam = new MockSteamProvider();
  else {
    const real = new RealSteamProvider(new TauriSteamBridge());
    steam = steamMode === "real" ? real : new SteamAutoProvider(real, new MockSteamProvider(), demoFallback);
  }

  // Media
  const mediaMode = config.providers.media;
  let media: MediaProvider;
  if (mediaMode === "mock" || !tauri) media = new MockMediaProvider();
  else {
    const local = new LocalMediaProvider(new TauriMediaBridge());
    media = mediaMode === "real" ? local : new MediaAutoProvider(local, new MockMediaProvider(), demoFallback);
  }

  const email: EmailProvider = new MockEmailProvider(); // Real adapters come later.
  const apps: AppProvider = tauri ? new TauriAppProvider() : new MockAppProvider();

  cached = {
    system,
    steam,
    media,
    email,
    apps,
    assistant: new LocalCommandProvider({
      getApps: () => apps.getApps(),
      getGames: () => steam.getGames(),
    }),
  };
  return cached;
}

/** Test-only: reset the cached providers. */
export function __resetProviders(): void {
  cached = null;
}
