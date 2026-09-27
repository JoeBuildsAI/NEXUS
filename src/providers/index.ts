import { config, type ProviderMode } from "@/core/config";
import type { SystemProvider } from "./system/SystemProvider";
import { MockSystemProvider } from "./system/MockSystemProvider";
import { TauriSystemProvider } from "./system/TauriSystemProvider";
import type { SteamProvider } from "./steam/SteamProvider";
import { MockSteamProvider } from "./steam/MockSteamProvider";
import { RealSteamProvider } from "./steam/RealSteamProvider";
import type { MediaProvider } from "./media/MediaProvider";
import { MockMediaProvider } from "./media/MockMediaProvider";
import { LocalMediaProvider } from "./media/LocalMediaProvider";
import type { EmailProvider } from "./email/EmailProvider";
import { MockEmailProvider } from "./email/MockEmailProvider";
import type { AssistantProvider } from "./assistant/AssistantProvider";
import { LocalCommandProvider } from "./assistant/LocalCommandProvider";
import type { AppProvider } from "./apps/AppProvider";
import { MockAppProvider } from "./apps/MockAppProvider";
import { TauriAppProvider } from "./apps/TauriAppProvider";

/**
 * Central provider factory. Selecting real vs. mock is a pure configuration
 * concern — the UI depends only on the interfaces. When NEXUS is cloned onto the
 * gaming PC, flip env flags (see .env.example) to enable real providers without
 * touching any component.
 */

function pick<M, R>(mode: ProviderMode, mock: () => M, real: () => R, canReal: boolean): M | R {
  if (mode === "mock") return mock();
  if (mode === "real") return real();
  // auto: use real only when it's viable (Tauri + not demo mode).
  return canReal ? real() : mock();
}

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
  const canNative = config.isTauri && !config.demoMode;

  const system = pick(
    config.providers.system,
    () => new MockSystemProvider(),
    () => new TauriSystemProvider(),
    // Real telemetry is safe to use whenever a Tauri backend is present, even
    // in demo mode. The provider itself falls back to mock per-capability.
    config.isTauri,
  );
  const steam = pick(
    config.providers.steam,
    () => new MockSteamProvider(),
    () => new RealSteamProvider(),
    false, // Steam integration not available on dev laptop.
  );
  const media = pick(
    config.providers.media,
    () => new MockMediaProvider(),
    () => new LocalMediaProvider(),
    canNative,
  );
  const email = pick(
    config.providers.email,
    () => new MockEmailProvider(),
    () => new MockEmailProvider(), // Real email adapters come later.
    false,
  );
  // Real app discovery (Start Menu) is safe and useful whenever Tauri is present.
  const apps: AppProvider = config.isTauri ? new TauriAppProvider() : new MockAppProvider();

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
