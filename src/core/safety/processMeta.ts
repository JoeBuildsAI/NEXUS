import type { ProcessClass } from "@/core/types";

type Tone = "neutral" | "accent" | "nominal" | "attention" | "warning" | "critical";

export const PROCESS_CLASS_META: Record<
  ProcessClass,
  { label: string; plain: string; tone: Tone; protected: boolean; explain: string }
> = {
  "system-critical": { label: "Windows", plain: "Windows", tone: "critical", protected: true, explain: "Core part of Windows. NEXUS never touches these." },
  driver: { label: "Hardware / Driver", plain: "Hardware/Driver", tone: "warning", protected: true, explain: "Talks to your hardware (GPU, chipset). Protected." },
  security: { label: "Security", plain: "Security", tone: "critical", protected: true, explain: "Antivirus / security software. Protected." },
  hardware: { label: "Hardware", plain: "Hardware", tone: "attention", protected: true, explain: "Peripheral vendor software (mouse, keyboard, RGB). Protected." },
  "user-application": { label: "Application", plain: "User Application", tone: "accent", protected: false, explain: "A normal app you installed. Can be marked for Gaming Mode." },
  optional: { label: "Optional", plain: "Optional", tone: "neutral", protected: false, explain: "Helper / tray / updater. Can be marked for Gaming Mode." },
  unknown: { label: "Unknown", plain: "Unknown", tone: "warning", protected: true, explain: "Not recognized. Treated as protected until you identify it." },
};

/** Friendly names for common executables (display only). */
const FRIENDLY: Record<string, { name: string; description: string }> = {
  "steam.exe": { name: "Steam", description: "Valve game launcher and store" },
  "chrome.exe": { name: "Google Chrome", description: "Web browser" },
  "msedge.exe": { name: "Microsoft Edge", description: "Web browser" },
  "firefox.exe": { name: "Firefox", description: "Web browser" },
  "discord.exe": { name: "Discord", description: "Voice, video and text chat" },
  "spotify.exe": { name: "Spotify", description: "Music streaming" },
  "code.exe": { name: "Visual Studio Code", description: "Code editor" },
  "explorer.exe": { name: "Windows Explorer", description: "Desktop shell and file manager" },
  "dwm.exe": { name: "Desktop Window Manager", description: "Composites windows and effects" },
  "svchost.exe": { name: "Service Host", description: "Hosts Windows services" },
  "csrss.exe": { name: "Client Server Runtime", description: "Core Windows subsystem" },
  "lsass.exe": { name: "Local Security Authority", description: "Handles sign-in and security policy" },
  "msmpeng.exe": { name: "Microsoft Defender", description: "Antimalware engine" },
  "nvcontainer.exe": { name: "NVIDIA Container", description: "Hosts NVIDIA driver services" },
  "razercentral.exe": { name: "Razer Central", description: "Razer peripheral software" },
  "obs64.exe": { name: "OBS Studio", description: "Streaming and recording" },
  "system": { name: "System", description: "Windows kernel" },
  "system idle process": { name: "System Idle", description: "Represents unused CPU time" },
  "memory compression": { name: "Memory Compression", description: "Windows memory manager" },
  "searchhost.exe": { name: "Windows Search", description: "Search indexing host" },
  "runtimebroker.exe": { name: "Runtime Broker", description: "Manages app permissions" },
  "taskhostw.exe": { name: "Task Host", description: "Runs Windows scheduled tasks" },
  "sihost.exe": { name: "Shell Infrastructure Host", description: "Start menu and shell UI" },
  "widgets.exe": { name: "Windows Widgets", description: "Widgets board" },
  "onedrive.exe": { name: "OneDrive", description: "Cloud file sync" },
  "teams.exe": { name: "Microsoft Teams", description: "Meetings and chat" },
  "slack.exe": { name: "Slack", description: "Team messaging" },
  "notepad.exe": { name: "Notepad", description: "Text editor" },
};

export function friendlyProcess(name: string): { name: string; description: string | null } {
  const hit = FRIENDLY[name.toLowerCase()];
  if (hit) return hit;
  const stem = name.replace(/\.exe$/i, "");
  return { name: stem.charAt(0).toUpperCase() + stem.slice(1), description: null };
}
