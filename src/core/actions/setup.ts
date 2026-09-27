import type { OperatingMode } from "@/core/types";
import { actionRegistry } from "./registry";
import type { ActionDefinition } from "./types";
import { useNavigationStore, type Screen, type SystemTab } from "@/state/navigationStore";
import { useModeStore } from "@/state/modeStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useMediaStore } from "@/state/mediaStore";
import { getProviders } from "@/providers";
import { DEMO_GAMES } from "@/core/demo/games";
import { createLogger } from "@/lib/logger";

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
      id: "launch-game",
      title: "Launch Game",
      description: "Launch a game via its configured launcher.",
      requiresConfirmation: false,
      keywords: ["play", "launch", "start game"],
      handler: async ({ args }) => {
        const gameId = args.gameId;
        if (!gameId) return { ok: false, message: "No game specified" };
        const title = DEMO_GAMES.find((g) => g.id === gameId)?.title ?? gameId;
        const ok = await getProviders().steam.launchGame(gameId);
        return {
          ok,
          message: ok ? `Launching ${title}…` : `Could not launch ${title}`,
        };
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
        useModeStore.getState().enterMode(mode);
        return { ok: true, message: `Entered ${mode} mode` };
      },
    },
    {
      id: "exit-mode",
      title: "Return to Normal Mode",
      description: "Exit the current mode and restore previous state.",
      requiresConfirmation: false,
      keywords: ["normal", "exit mode"],
      handler: () => {
        useModeStore.getState().exitToNormal();
        return { ok: true, message: "Returned to normal mode" };
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
        return { ok: true, message: "Opened storage" };
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
        return { ok: true, message: "Storage analysis ready" };
      },
    },
    {
      id: "show-processes",
      title: "Show Running Processes",
      description: "Open the process viewer.",
      requiresConfirmation: false,
      keywords: ["processes", "tasks"],
      handler: () => {
        openSystemTab("processes");
        return { ok: true, message: "Opened processes" };
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
  ];

  actionRegistry.registerAll(defs);
  log.info("Registered actions", { count: defs.length });
}

function openSystemTab(tab: SystemTab) {
  const nav = useNavigationStore.getState();
  nav.navigate("system");
  nav.setSystemTab(tab);
}
