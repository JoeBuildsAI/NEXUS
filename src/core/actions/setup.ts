import type { OperatingMode } from "@/core/types";
import { actionRegistry } from "./registry";
import type { ActionDefinition } from "./types";
import { lifeActions } from "./lifeActions";
import {
  useNavigationStore,
  type Screen,
  type SettingsSection,
  type SystemTab,
} from "@/state/navigationStore";
import { useModeStore } from "@/state/modeStore";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { activity } from "@/state/activityStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useMediaStore } from "@/state/mediaStore";
import { useSettingsStore, type EnvironmentPreset } from "@/state/settingsStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { notify } from "@/state/toastStore";
import { getProviders } from "@/providers";
import { createLogger } from "@/lib/logger";
import { formatBitrate, formatBytes, formatUptime } from "@/lib/utils";

const log = createLogger("actions");

let registered = false;

/**
 * Register the canonical set of application actions. Idempotent. This is the
 * complete surface of side effects reachable from the command palette or any
 * assistant provider.
 */
export function setupActions(): void {
  if (registered) return;
  registered = true;

  const defs: ActionDefinition[] = [
    {
      id: "navigate",
      title: "Navigate",
      description: "Open a top-level screen.",
      requiresConfirmation: false,
      keywords: ["open", "go to", "show"],
      handler: ({ args }) => {
        const screen = (args.screen as Screen) ?? "home";
        useNavigationStore.getState().navigate(screen);
        return { ok: true, message: `Opened ${screen}` };
      },
    },
    {
      id: "open-settings",
      title: "Open Settings",
      description: "Open a settings section.",
      requiresConfirmation: false,
      keywords: ["settings"],
      handler: ({ args }) => {
        const nav = useNavigationStore.getState();
        nav.navigate("settings");
        nav.setSettingsSection((args.section as SettingsSection) ?? "general");
        return { ok: true };
      },
    },
    {
      id: "launch-game",
      title: "Launch Game",
      description: "Launch a game via its configured launcher.",
      requiresConfirmation: false,
      keywords: ["play", "launch", "start game"],
      handler: async ({ args }) => {
        const gameId = args.gameId;
        if (!gameId) return { ok: false, message: "No game specified" };
        const { steam, xbox } = getProviders();
        const isXbox = gameId.startsWith("xbox:");
        const game = isXbox ? await xbox.getGameDetails(gameId) : await steam.getGameDetails(gameId);
        const title = game?.title ?? gameId;
        if (game && !game.installed) {
          notify.warn(`${title} is not installed`, "Install it from your launcher first.");
          return { ok: false, message: "Not installed" };
        }
        const ok = isXbox ? await xbox.launchGame(gameId) : await steam.launchGame(gameId);
        if (ok) {
          useGameSessionStore.getState().begin(gameId, title);
          activity.record("game-launched", `Launched ${title}`, { gameId });
          notify.success(`Launching ${title}`, "NEXUS footprint reduced while the game runs.");
        } else {
          notify.error(`Could not launch ${title}`);
        }
        return { ok, message: ok ? `Launching ${title}…` : `Could not launch ${title}` };
      },
    },
    {
      id: "show-game",
      title: "Show Game",
      description: "Open a game's detail view.",
      requiresConfirmation: false,
      keywords: ["show", "details"],
      handler: ({ args }) => {
        if (!args.gameId) return { ok: false };
        const nav = useNavigationStore.getState();
        nav.navigate("gaming");
        nav.selectGame(args.gameId);
        return { ok: true };
      },
    },
    {
      id: "launch-app",
      title: "Launch Application",
      description: "Launch a discovered Windows application by id.",
      requiresConfirmation: false,
      keywords: ["open", "launch", "run"],
      handler: async ({ args }) => {
        if (!args.appId) return { ok: false, message: "No application specified" };
        const res = await getProviders().apps.launch(args.appId);
        if (res.ok) notify.success(`Launched ${res.name ?? "application"}`);
        else notify.error("Launch failed", res.message);
        return { ok: res.ok, message: res.message };
      },
    },
    {
      id: "enter-mode",
      title: "Enter Mode",
      description: "Switch to an operating mode.",
      requiresConfirmation: false,
      keywords: ["mode"],
      handler: ({ args }) => {
        const mode = (args.mode as OperatingMode) ?? "normal";
        void useModeStore.getState().enterMode(mode);
        return { ok: true, message: `Entering ${mode} mode` };
      },
    },
    {
      id: "exit-mode",
      title: "Return to Normal Mode",
      description: "Exit the current mode and restore previous state.",
      requiresConfirmation: false,
      keywords: ["normal", "exit mode"],
      handler: () => {
        void useModeStore.getState().exitToNormal();
        return { ok: true, message: "Returning to normal mode" };
      },
    },
    {
      id: "open-storage",
      title: "Show Storage",
      description: "Open the storage analyzer.",
      requiresConfirmation: false,
      keywords: ["storage", "disk"],
      handler: () => {
        openSystemTab("storage");
        return { ok: true };
      },
    },
    {
      id: "analyze-storage",
      title: "Analyze Storage",
      description: "Run storage analysis (discover only — nothing is deleted).",
      requiresConfirmation: false,
      keywords: ["analyze", "scan", "cleanup"],
      handler: () => {
        openSystemTab("storage");
        return { ok: true };
      },
    },
    {
      id: "show-processes",
      title: "Show Running Processes",
      description: "Open the process explorer.",
      requiresConfirmation: false,
      keywords: ["processes", "tasks"],
      handler: () => {
        openSystemTab("processes");
        return { ok: true };
      },
    },
    {
      id: "show-hardware",
      title: "Show Hardware",
      description: "Open the hardware inventory.",
      requiresConfirmation: false,
      keywords: ["hardware", "gpu", "cpu"],
      handler: () => {
        openSystemTab("hardware");
        return { ok: true };
      },
    },
    {
      id: "show-startup",
      title: "Show Startup Apps",
      description: "Open startup management.",
      requiresConfirmation: false,
      keywords: ["startup", "autostart"],
      handler: () => {
        openSystemTab("startup");
        return { ok: true };
      },
    },
    {
      id: "clear-workspace",
      title: "Clear Media Workspace",
      description: "Unload every player slot.",
      requiresConfirmation: true,
      keywords: ["clear", "workspace"],
      handler: () => {
        useMediaStore.getState().clearAll();
        notify.neutral("Workspace cleared");
        return { ok: true };
      },
    },
    {
      id: "open-diagnostics",
      title: "Open Diagnostics",
      description: "Sanitized environment diagnostics.",
      requiresConfirmation: false,
      keywords: ["diagnostics", "debug", "logs"],
      handler: () => {
        const nav = useNavigationStore.getState();
        nav.navigate("settings");
        nav.setSettingsSection("system");
        return { ok: true };
      },
    },
    {
      id: "open-mail",
      title: "Open Mail",
      description: "Open a Communications view, surface or sender.",
      requiresConfirmation: false,
      keywords: ["mail", "inbox", "email"],
      handler: (ctx) => {
        const a = ctx.args as { surface?: string; view?: string; sender?: string; query?: string; accountId?: string };
        useNavigationStore.getState().openCommunications({ surface: (a.surface as "inbox" | "health" | "subscriptions" | "rules" | "summary") ?? "inbox", view: a.view, sender: a.sender, query: a.query, accountId: a.accountId });
        return { ok: true };
      },
    },
    {
      id: "refresh-mail",
      title: "Refresh Mail",
      description: "Sync every connected account now.",
      requiresConfirmation: false,
      keywords: ["refresh", "sync", "mail"],
      handler: async (ctx) => {
        const a = ctx.args as { provider?: "gmail" | "outlook" };
        const email = getProviders().email as { real?: { providerId: string; syncNow: (force?: boolean) => Promise<void> }[] };
        const targets = (email.real ?? []).filter((p) => !a.provider || p.providerId === a.provider);
        await Promise.all(targets.map((p) => p.syncNow(true).catch(() => undefined)));
        useNavigationStore.getState().openCommunications({ surface: "inbox" });
        notify.neutral(a.provider ? `${a.provider === "gmail" ? "Gmail" : "Outlook"} refreshed` : "Mail refreshed");
        return { ok: true };
      },
    },
    {
      id: "system-query",
      title: "System Query",
      description: "Report a live system metric.",
      requiresConfirmation: false,
      keywords: ["cpu", "memory", "gpu", "network", "uptime"],
      handler: ({ args }) => {
        const s = useTelemetryStore.getState().snapshot;
        if (!s) return { ok: false, message: "Telemetry unavailable" };
        const metric = args.metric ?? "cpu";
        const text: Record<string, [string, string]> = {
          cpu: [`CPU ${s.cpu.usagePercent}%`, `${s.cpu.name} · ${s.cpu.cores} cores`],
          memory: [`Memory ${s.memory.usagePercent}%`, `${formatBytes(s.memory.usedBytes, 1)} of ${formatBytes(s.memory.totalBytes, 0)} in use`],
          gpu: s.gpu ? [`GPU ${s.gpu.usagePercent}%`, s.gpu.name] : ["GPU telemetry unavailable", "No reliable source on this machine."],
          network: [`Network ↓ ${formatBitrate(s.network.downBytesPerSec)}`, `↑ ${formatBitrate(s.network.upBytesPerSec)} · ${s.network.ssidOrInterface ?? "offline"}`],
          uptime: [`Uptime ${formatUptime(s.uptimeSeconds)}`, `${s.processCount} processes running`],
        };
        const [title, desc] = text[metric] ?? text.cpu!;
        notify.info(title, desc);
        openSystemTab("overview");
        return { ok: true, message: title };
      },
    },
    {
      id: "pause-media",
      title: "Pause All Media",
      description: "Pause every media workspace player.",
      requiresConfirmation: false,
      keywords: ["pause", "stop"],
      handler: () => {
        useMediaStore.getState().pauseAll();
        return { ok: true, message: "Paused all media" };
      },
    },
    {
      id: "play-media",
      title: "Play All Media",
      description: "Resume every loaded media workspace player.",
      requiresConfirmation: false,
      keywords: ["play"],
      handler: () => {
        useMediaStore.getState().playAll();
        return { ok: true };
      },
    },
    {
      id: "mute-media",
      title: "Mute All Media",
      description: "Mute every media workspace player.",
      requiresConfirmation: false,
      keywords: ["mute", "silence"],
      handler: () => {
        useMediaStore.getState().muteAll(true);
        return { ok: true, message: "Muted all media" };
      },
    },
    {
      id: "privacy-mode",
      title: "Activate Privacy Mode",
      description: "Immediately hide media and secure the workspace.",
      requiresConfirmation: false,
      keywords: ["privacy", "panic", "hide"],
      handler: () => {
        usePrivacyStore.getState().activate();
        return { ok: true, message: "Privacy mode active" };
      },
    },
    {
      id: "toggle-command-palette",
      title: "Toggle Command Palette",
      description: "Open or close the command palette.",
      requiresConfirmation: false,
      keywords: ["command", "palette"],
      handler: () => {
        useNavigationStore.getState().toggleCommandPalette();
        return { ok: true };
      },
    },
    {
      id: "set-environment",
      title: "Set Environment",
      description: "Switch the ambient environment preset.",
      requiresConfirmation: false,
      keywords: ["environment", "theme"],
      handler: ({ args }) => {
        const env = args.environment as EnvironmentPreset | undefined;
        if (!env) return { ok: false };
        useSettingsStore.getState().setAppearance({ environment: env });
        notify.neutral(`Environment · ${env.toUpperCase()}`);
        return { ok: true };
      },
    },
    {
      id: "replay-onboarding",
      title: "Replay Onboarding",
      description: "Show the first-run experience again.",
      requiresConfirmation: false,
      keywords: ["onboarding", "setup"],
      handler: () => {
        useSettingsStore.getState().setProfile({ onboardingComplete: false });
        return { ok: true };
      },
    },
  ];

  actionRegistry.registerAll([...defs, ...lifeActions()]);
  log.info("Registered actions", { count: defs.length + lifeActions().length });
}

function openSystemTab(tab: SystemTab) {
  const nav = useNavigationStore.getState();
  nav.navigate("system");
  nav.setSystemTab(tab);
}
