import type { Game } from "@/core/types";

export const PROVIDER_LABEL: Record<Game["launcher"], string> = { steam: "Steam", xbox: "Xbox", epic: "Epic", gog: "GOG", standalone: "PC" };

/** Short install-state label; Steam manifests distinguish downloads/updates from "not installed". */
export function installLabel(g: Pick<Game, "installed" | "installState">): string {
  if (g.installed) return "Installed";
  switch (g.installState) {
    case "downloading": return "Downloading";
    case "updating": return "Updating";
    case "uninstalling": return "Uninstalling";
    default: return "Not installed";
  }
}
