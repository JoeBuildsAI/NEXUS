import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";
import { useSettingsStore } from "./settingsStore";

export type ActivityKind =
  | "game-launched"
  | "game-session-ended"
  | "achievement-unlocked"
  | "mode-entered"
  | "mode-exited"
  | "cleanup-completed"
  | "config-imported"
  | "integration-connected"
  | "integration-disconnected"
  | "media-authorized"
  | "media-revoked"
  | "session-recovered"
  | "email-rule-created"
  | "email-cleanup-completed"
  | "email-unsubscribed"
  | "life-backup";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  at: number;
  /** Short, already-safe text. Never media filenames/paths, never email content. */
  text: string;
  /** Optional navigation hint (game id, screen). */
  gameId?: string;
}

interface ActivityState {
  entries: ActivityEntry[];
  record: (kind: ActivityKind, text: string, extra?: { gameId?: string }) => void;
  clear: () => void;
}

const LIMIT = 200;
const KINDS: ActivityKind[] = ["game-launched", "game-session-ended", "achievement-unlocked", "mode-entered", "mode-exited", "cleanup-completed", "config-imported", "integration-connected", "integration-disconnected", "media-authorized", "media-revoked", "session-recovered"];

/**
 * Local, private activity history. Records only what NEXUS itself did or
 * observed about the machine — never private media names or message content.
 * Can be disabled in Settings → System and cleared at any time.
 */
export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      entries: [],
      record: (kind, text, extra) => {
        if (!useSettingsStore.getState().system.activityHistory) return;
        set((s) => ({ entries: [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, at: Date.now(), text: text.slice(0, 140), ...(extra?.gameId ? { gameId: extra.gameId } : {}) }, ...s.entries].slice(0, LIMIT) }));
      },
      clear: () => set({ entries: [] }),
    }),
    {
      name: "nexus-activity",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        entries: vArr((persisted as { entries?: unknown } | undefined)?.entries, (x): x is ActivityEntry => isObj(x) && typeof x.id === "string" && typeof x.text === "string" && typeof x.at === "number" && KINDS.includes(x.kind as ActivityKind), [], LIMIT),
      }),
    },
  ),
);

/** Convenience for call sites. */
export const activity = {
  record: (kind: ActivityKind, text: string, extra?: { gameId?: string }) => useActivityStore.getState().record(kind, text, extra),
};
