import type { AppEntry } from "@/core/types";
import type { AppProvider } from "./AppProvider";

const DEMO_APPS: readonly AppEntry[] = [
  "Discord", "Google Chrome", "Microsoft Edge", "Spotify", "Visual Studio Code", "Steam",
  "Notepad", "Calculator", "OBS Studio", "Slack", "Windows Terminal", "File Explorer",
  "Epic Games Launcher", "Blender", "Paint", "Task Manager",
].map((name) => ({
  id: `mock-${name.toLowerCase().replace(/\s+/g, "-")}`,
  name,
  path: `C:\\Program Files\\${name}\\${name.replace(/\s+/g, "")}.exe`,
  source: "mock" as const,
}));

export class MockAppProvider implements AppProvider {
  readonly id = "mock-apps";
  async getApps() {
    return DEMO_APPS;
  }
  async refresh() {
    return DEMO_APPS;
  }
  async launch(appId: string) {
    const app = DEMO_APPS.find((a) => a.id === appId);
    if (!app) return { ok: false, message: "Unknown application" };
    console.info(`[MockAppProvider] Simulating launch of ${app.name}`);
    return { ok: true, name: app.name };
  }
}
