/**
 * Versioned NEXUS configuration export/import.
 *
 * Exports non-sensitive settings only. NEVER includes API secrets, email
 * credentials, private media index/history, or (by default) media root paths.
 */
import type { ProcessPreference } from "@/state/processPrefsStore";
import type { TrackedAchievement } from "@/state/gamePrefsStore";

export const BACKUP_VERSION = 1;

export interface NexusBackup {
  format: "nexus-config";
  version: number;
  exportedAt: number;
  app: { version: string };
  settings: {
    profile: { name: string };
    appearance: Record<string, unknown>;
    startup: Record<string, unknown>;
    gaming: Record<string, unknown>;
    media: { defaultColumns: number; defaultRows: number; pauseOnHide: boolean };
    privacy: Record<string, unknown>;
    system: Record<string, unknown>;
    ai: Record<string, unknown>;
    shortcuts: Record<string, unknown>;
  };
  processPrefs: Record<string, ProcessPreference>;
  trackedAchievements: TrackedAchievement[];
  /** Included only when the user explicitly opts in. */
  mediaRoots?: string[];
}

export interface BackupInput {
  appVersion: string;
  settings: NexusBackup["settings"] & { media: NexusBackup["settings"]["media"] & Record<string, unknown> };
  processPrefs: Record<string, ProcessPreference>;
  trackedAchievements: TrackedAchievement[];
  mediaRoots?: string[];
  includeMediaRoots?: boolean;
}

const FORBIDDEN_KEYS = /(apikey|api_key|secret|token|password|credential|steamid)/i;

function stripSensitive<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out as T;
}

export function createBackup(input: BackupInput): NexusBackup {
  const s = input.settings;
  const backup: NexusBackup = {
    format: "nexus-config",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    app: { version: input.appVersion },
    settings: {
      profile: { name: s.profile.name },
      appearance: stripSensitive(s.appearance),
      startup: stripSensitive(s.startup),
      gaming: stripSensitive(s.gaming),
      // Only non-path media prefs; authorized folders are excluded by default.
      media: { defaultColumns: s.media.defaultColumns, defaultRows: s.media.defaultRows, pauseOnHide: s.media.pauseOnHide },
      privacy: stripSensitive(s.privacy),
      system: stripSensitive(s.system),
      ai: stripSensitive(s.ai),
      shortcuts: stripSensitive(s.shortcuts),
    },
    processPrefs: { ...input.processPrefs },
    trackedAchievements: [...input.trackedAchievements],
  };
  if (input.includeMediaRoots && input.mediaRoots?.length) backup.mediaRoots = [...input.mediaRoots];
  return backup;
}

export type ValidationResult = { ok: true; backup: NexusBackup; warnings: string[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate a parsed JSON payload. Rejects unknown formats/versions and sanitizes. */
export function validateBackup(payload: unknown): ValidationResult {
  if (!isObj(payload)) return { ok: false, error: "Not a NEXUS configuration file." };
  if (payload.format !== "nexus-config") return { ok: false, error: "Unrecognized file format." };
  const version = Number(payload.version);
  if (!Number.isFinite(version) || version < 1) return { ok: false, error: "Missing or invalid version." };
  if (version > BACKUP_VERSION) return { ok: false, error: `This file was created by a newer NEXUS (format v${version}). Update NEXUS to import it.` };
  if (!isObj(payload.settings)) return { ok: false, error: "Missing settings block." };

  const warnings: string[] = [];
  const s = payload.settings as Record<string, unknown>;
  const section = (k: string): Record<string, unknown> => (isObj(s[k]) ? stripSensitive(s[k] as Record<string, unknown>) : {});
  const media = isObj(s.media) ? (s.media as Record<string, unknown>) : {};
  const prefsRaw = isObj(payload.processPrefs) ? (payload.processPrefs as Record<string, unknown>) : {};
  const processPrefs: Record<string, ProcessPreference> = {};
  for (const [k, v] of Object.entries(prefsRaw)) {
    const p = v === "suspend" ? "close" : v;
    if (p === "close" || p === "never" || p === "normal") processPrefs[k.toLowerCase()] = p;
    else warnings.push(`Ignored unknown process preference for ${k}.`);
  }
  const tracked = Array.isArray(payload.trackedAchievements)
    ? (payload.trackedAchievements as unknown[]).filter((t): t is TrackedAchievement => isObj(t) && typeof t.gameId === "string" && typeof t.achievementId === "string" && typeof t.name === "string")
    : [];
  const profile = isObj(s.profile) && typeof s.profile.name === "string" ? { name: s.profile.name.slice(0, 40) } : { name: "" };
  const mediaRoots = Array.isArray(payload.mediaRoots) ? (payload.mediaRoots as unknown[]).filter((p): p is string => typeof p === "string") : undefined;
  if (mediaRoots?.length) warnings.push("Media root paths are included; they will need re-authorization on this machine.");

  return {
    ok: true,
    warnings,
    backup: {
      format: "nexus-config",
      version,
      exportedAt: Number(payload.exportedAt) || 0,
      app: { version: isObj(payload.app) && typeof payload.app.version === "string" ? payload.app.version : "unknown" },
      settings: {
        profile,
        appearance: section("appearance"),
        startup: section("startup"),
        gaming: section("gaming"),
        media: { defaultColumns: Number(media.defaultColumns) || 3, defaultRows: Number(media.defaultRows) || 2, pauseOnHide: media.pauseOnHide !== false },
        privacy: section("privacy"),
        system: section("system"),
        ai: section("ai"),
        shortcuts: section("shortcuts"),
      },
      processPrefs,
      trackedAchievements: tracked,
      mediaRoots,
    },
  };
}

/** Assert that a serialized backup contains no secret-like keys (defense in depth). */
export function containsSensitive(json: string): boolean {
  return /"(apiKey|api_key|steamId|steam\.apiKey|steam\.steamId|token|password|secret)"\s*:/i.test(json);
}
