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
import { EmailAutoProvider } from "./email/EmailAutoProvider";
import { TauriMailBridge } from "./email/MailBridge";
import { gmailAdapter, outlookAdapter } from "./email/adapters";
import type { AssistantProvider } from "./assistant/AssistantProvider";
import { LocalCommandProvider } from "./assistant/LocalCommandProvider";
import type { AppProvider } from "./apps/AppProvider";
import { NoIntelligenceProvider, type InboxIntelligenceProvider } from "./intelligence/InboxIntelligenceProvider";
import { useSettingsStore } from "@/state/settingsStore";
import { useLifeStore } from "@/state/lifeStore";
import type { LifeIndexEntry } from "./assistant/LocalCommandProvider";

/** Titles only; bounded so a 10k-task library never dominates the palette. */
function lifeIndex(): LifeIndexEntry[] {
  const s = useLifeStore.getState();
  if (s.status !== "ready") return [];
  const out: LifeIndexEntry[] = [];
  for (const t of s.tasks) if (t.status === "open") out.push({ kind: "task", id: t.id, title: t.title, hint: t.dueDay ? `Task · ${t.dueDay}` : "Task" });
  for (const r of s.routines) out.push({ kind: "routine", id: r.id, title: r.name, hint: "Routine" });
  for (const e of s.exercises) out.push({ kind: "exercise", id: e.id, title: e.name, hint: "Exercise" });
  for (const w of s.workoutTemplates) out.push({ kind: "workout", id: w.id, title: w.name, hint: "Workout" });
  for (const f of s.foods) out.push({ kind: "food", id: f.id, title: f.name, hint: "Food" });
  for (const m of s.meals) out.push({ kind: "meal", id: m.id, title: m.name, hint: "Meal" });
  for (const e of s.events) if (!e.recurrence) out.push({ kind: "event", id: e.id, title: e.title, hint: `Event · ${e.day}`, day: e.day });
  return out.slice(0, 5000);
}
import { MockAppProvider } from "./apps/MockAppProvider";
import { XboxGameProvider } from "./xbox/XboxGameProvider";
import { TauriAppProvider } from "./apps/TauriAppProvider";

/**
 * Central provider factory.
 *
 * Under Tauri, real providers are used wherever the machine supports them:
 *   system  → real telemetry/processes/startup
 *   apps    → Start Menu discovery
 *   steam   → real discovery when Steam is detected, demo library otherwise
 *   media   → real once a folder is authorized, demo library until then
 *   email   → unified real accounts (Outlook/Gmail) once connected, demo inbox until then
 * Env overrides (VITE_PROVIDER_*) force "mock" or "real" per domain; "auto" is
 * the default described above. Demo fallback is disabled when VITE_DEMO_MODE=false.
 */

export interface Providers {
  readonly system: SystemProvider;
  readonly steam: SteamProvider;
  readonly media: MediaProvider;
  readonly email: EmailProvider;
  readonly apps: AppProvider;
  /** Xbox / Microsoft Store PC games (desktop only; local discovery, honest capabilities). */
  readonly xbox: XboxGameProvider;
  readonly assistant: AssistantProvider;
  /** Optional inbox intelligence — "none" until a provider is configured (never faked). */
  readonly intelligence: InboxIntelligenceProvider;
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

  const emailMode = config.providers.email;
  let email: EmailProvider;
  if (emailMode === "mock" || !tauri) email = new MockEmailProvider();
  else {
    const bridge = new TauriMailBridge();
    email = new EmailAutoProvider(bridge, { outlook: outlookAdapter, gmail: gmailAdapter }, new MockEmailProvider(), demoFallback);
  }
  const apps: AppProvider = tauri ? new TauriAppProvider() : new MockAppProvider();

  cached = {
    system,
    steam,
    media,
    email,
    apps,
    xbox: new XboxGameProvider(),
    intelligence: new NoIntelligenceProvider(() => useSettingsStore.getState().ai.inboxMode),
    assistant: new LocalCommandProvider({
      getApps: () => apps.getApps(),
      getGames: () => steam.getGames(),
      getLifeIndex: () => lifeIndex(),
    }),
  };
  return cached;
}

/** Test-only: reset the cached providers. */
export function __resetProviders(): void {
  cached = null;
}
