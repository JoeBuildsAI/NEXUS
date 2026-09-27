import { ExternalLink, Play, Target, Trophy } from "lucide-react";
import type { ContextMenuItem } from "@/components/ui";
import { actionRegistry } from "@/core/actions/registry";
import type { Game } from "@/core/types";

/** Right-click menu for a game: PLAY · VIEW ACHIEVEMENTS · TRACK COMPLETION · OPEN STEAM. */
export function gameContextItems(g: Game, opts: { select: (id: string) => void }): (ContextMenuItem | "separator")[] {
  const items: (ContextMenuItem | "separator")[] = [
    { id: "play", label: g.installed ? "Play" : "Not installed", icon: <Play size={13} />, disabled: !g.installed, onSelect: () => void actionRegistry.execute("launch-game", { args: { gameId: g.id } }) },
    { id: "ach", label: "View achievements", icon: <Trophy size={13} />, onSelect: () => opts.select(g.id) },
    { id: "track", label: "Track completion", icon: <Target size={13} />, onSelect: () => opts.select(g.id) },
  ];
  if (g.steamAppId) {
    items.push("separator", { id: "steam", label: "Open in Steam", icon: <ExternalLink size={13} />, onSelect: () => void openInSteam(g.steamAppId!) });
  }
  return items;
}

/** Opens the Steam client's own page for the app via the allowlisted native opener. */
export async function openInSteam(appId: number) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url: `steam://nav/games/details/${appId}` });
  } catch {
    /* browser preview */
  }
}
