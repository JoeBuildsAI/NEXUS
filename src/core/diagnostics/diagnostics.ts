import type { ProviderHealth, SteamStatus } from "@/core/types";

/**
 * Environment diagnostics — sanitized by construction. Consumers pass counts
 * and booleans; this module never accepts secrets or media paths.
 */
export interface DiagnosticsInput {
  appVersion: string;
  runtime: "desktop" | "browser";
  demoMode: boolean;
  os: { name: string; version: string; arch: string } | null;
  providers: Record<string, ProviderHealth>;
  steam: SteamStatus | null;
  mediaRootsAuthorized: number;
  mediaRootsReachable: number;
  gpu: { name: string | null; utilizationSupported: boolean; temperatureSupported: boolean } | null;
  autostartEnabled: boolean | null;
  privacyHotkeyRegistered: boolean | null;
  systemSafety: "observe" | "enabled";
  processAllowlistCount: number;
  environment: string;
}

export function renderDiagnostics(d: DiagnosticsInput): string {
  const lines: string[] = [];
  lines.push(`NEXUS Diagnostics`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`NEXUS version: ${d.appVersion}`);
  lines.push(`Runtime: ${d.runtime}${d.demoMode ? " (demo mode)" : ""}`);
  lines.push(`Windows: ${d.os ? `${d.os.name} ${d.os.version} (${d.os.arch})` : "unknown (browser preview)"}`);
  lines.push("");
  lines.push("Providers:");
  for (const [name, h] of Object.entries(d.providers)) lines.push(`  ${name.padEnd(8)} ${h.state.toUpperCase().padEnd(15)} ${h.summary}`);
  lines.push("");
  lines.push("Steam:");
  if (d.steam) {
    lines.push(`  Detected: ${d.steam.detected ? "yes" : "no"}`);
    lines.push(`  Libraries: ${d.steam.libraries} · Installed games: ${d.steam.installedGames} · Unreadable manifests: ${d.steam.malformedManifests}`);
    lines.push(`  Web API configured: ${d.steam.apiConfigured ? "yes" : "no"} · SteamID configured: ${d.steam.steamIdConfigured ? "yes" : "no"}`);
  } else lines.push("  Status unavailable");
  lines.push("");
  lines.push(`Media: authorized roots: ${d.mediaRootsAuthorized} · reachable: ${d.mediaRootsReachable}`);
  lines.push(`GPU: ${d.gpu?.name ?? "unknown"} · utilization ${d.gpu?.utilizationSupported ? "supported" : "unsupported"} · temperature ${d.gpu?.temperatureSupported ? "supported" : "unsupported"}`);
  lines.push(`Autostart: ${d.autostartEnabled == null ? "n/a" : d.autostartEnabled ? "enabled" : "disabled"}`);
  lines.push(`Privacy hotkey registered: ${d.privacyHotkeyRegistered == null ? "n/a" : d.privacyHotkeyRegistered ? "yes" : "no"}`);
  lines.push(`System safety: ${d.systemSafety} · process allowlist entries: ${d.processAllowlistCount}`);
  lines.push(`Environment preset: ${d.environment}`);
  return lines.join("\n");
}

/** Guard used by tests and the UI: the rendered text must contain none of these. */
export function looksSanitized(text: string, forbidden: string[]): boolean {
  return forbidden.every((f) => !f || !text.toLowerCase().includes(f.toLowerCase()));
}
