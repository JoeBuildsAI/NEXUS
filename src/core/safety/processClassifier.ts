import type { ProcessClass } from "@/core/types";

/**
 * Deterministic process safety classifier.
 *
 * SAFETY: When in doubt, return "unknown". UNKNOWN and SYSTEM_CRITICAL classes
 * must NEVER be automatically terminated or suspended by NEXUS. This function is
 * intentionally conservative — a false "user-application" could allow an unsafe
 * automatic action, so ambiguous cases fall through to "unknown".
 */

const SYSTEM_CRITICAL = new Set([
  "system",
  "system idle process",
  "smss.exe",
  "csrss.exe",
  "wininit.exe",
  "winlogon.exe",
  "services.exe",
  "lsass.exe",
  "svchost.exe",
  "explorer.exe",
  "dwm.exe",
  "fontdrvhost.exe",
  "registry",
  "memory compression",
  "ntoskrnl.exe",
  "conhost.exe",
  "sihost.exe",
  "taskhostw.exe",
]);

const SECURITY_HINTS = [
  "defender",
  "msmpeng",
  "securityhealth",
  "mssense",
  "nissrv",
  "windefend",
];

const DRIVER_HINTS = ["nvidia", "nvcontainer", "nvsphelper", "amd", "radeon", "intel", "igfx"];

const HARDWARE_PUBLISHERS = ["razer", "logitech", "corsair", "steelseries", "asus", "msi", "elgato"];

const KNOWN_USER_APPS = new Set([
  "steam.exe",
  "chrome.exe",
  "firefox.exe",
  "msedge.exe",
  "discord.exe",
  "spotify.exe",
  "code.exe",
  "slack.exe",
  "obs64.exe",
  "epicgameslauncher.exe",
]);

const OPTIONAL_HINTS = ["tray", "helper", "updater", "assistant", "companion"];

// Path hints use forward slashes; paths are normalized before matching.
const SECURITY_PATH_HINTS = ["/windows defender/", "/malwarebytes/", "/bitdefender/", "/kaspersky", "/eset/", "/norton", "/avast", "/avg/", "/crowdstrike/", "/sentinelone/"];
const DRIVER_PATH_HINTS = ["/nvidia corporation/", "/amd/", "/realtek/", "/intel/", "/drivers/"];
const USER_APP_PATH_HINTS = ["/program files/", "/program files (x86)/", "/appdata/local/programs/", "/appdata/roaming/", "/windowsapps/", "/scoop/", "/chocolatey/"];

/** Where the executable lives, when the native layer could read it. */
function classifyByPath(path: string | null | undefined): ProcessClass | null {
  if (!path) return null;
  const p = path.trim().toLowerCase().split("\\").join("/");
  if (!p.includes("/")) return null;
  if (SECURITY_PATH_HINTS.some((h) => p.includes(h))) return "security";
  if (DRIVER_PATH_HINTS.some((h) => p.includes(h))) return "driver";
  // Anything shipped inside the Windows directory is part of Windows: protected.
  if (p.includes("/windows/") && !p.includes("/windows/systemapps/")) return "system-critical";
  // Installed applications: Program Files, per-user program folders, store packages, per-user vendor folders.
  if (USER_APP_PATH_HINTS.some((h) => p.includes(h))) return "user-application";
  if (/\/appdata\/local\/[^/]+\/[^/]+\.exe$/.test(p)) return "user-application";
  return null;
}

export function classifyProcess(
  name: string,
  publisher: string | null,
  path?: string | null,
): ProcessClass {
  const n = name.trim().toLowerCase();
  const pub = (publisher ?? "").trim().toLowerCase();

  if (!n) return "unknown";
  if (SYSTEM_CRITICAL.has(n)) return "system-critical";
  if (SECURITY_HINTS.some((h) => n.includes(h))) return "security";
  if (DRIVER_HINTS.some((h) => n.includes(h) || pub.includes(h))) return "driver";
  if (HARDWARE_PUBLISHERS.some((h) => pub.includes(h))) return "hardware";
  if (KNOWN_USER_APPS.has(n)) return "user-application";
  // Name hints are weak; the executable's location is decisive when available.
  const byPath = classifyByPath(path);
  if (byPath) return byPath;
  // Optional bloatware hints only apply when a publisher is known. A
  // publisher-less "helper"/"updater" binary is more suspicious and must stay
  // UNKNOWN (protected) rather than becoming manageable.
  if (pub && OPTIONAL_HINTS.some((h) => n.includes(h))) return "optional";

  // A recognizable third-party publisher with an .exe strongly implies a user
  // application, but only when the publisher is present and non-trivial.
  if (pub && pub !== "microsoft" && n.endsWith(".exe")) return "user-application";

  return "unknown";
}

/**
 * Whether a process class may ever be the target of an automatic (allowlist)
 * management action. Even for these classes an explicit user allowlist entry is
 * still required — this only screens out categories that are never eligible.
 */
export function isManageable(cls: ProcessClass): boolean {
  return cls === "user-application" || cls === "optional";
}
