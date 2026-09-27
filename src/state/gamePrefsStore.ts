import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";

export interface TrackedAchievement {
  gameId: string;
  gameTitle: string;
  achievementId: string;
  name: string;
  trackedAt: number;
}

interface GamePrefsState {
  /** Achievements the user is explicitly pursuing (one per game). */
  tracked: TrackedAchievement[];
  track: (t: Omit<TrackedAchievement, "trackedAt">) => void;
  untrack: (achievementId: string) => void;
  isTracked: (achievementId: string) => boolean;
  trackedFor: (gameId: string) => TrackedAchievement | undefined;
}

export const useGamePrefsStore = create<GamePrefsState>()(
  persist(
    (set, get) => ({
      tracked: [],
      track: (t) => set((s) => ({ tracked: [{ ...t, trackedAt: Date.now() }, ...s.tracked.filter((x) => x.gameId !== t.gameId)] })),
      untrack: (achievementId) => set((s) => ({ tracked: s.tracked.filter((x) => x.achievementId !== achievementId) })),
      isTracked: (achievementId) => get().tracked.some((x) => x.achievementId === achievementId),
      trackedFor: (gameId) => get().tracked.find((x) => x.gameId === gameId),
    }),
    {
      name: "nexus-game-prefs",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        tracked: vArr((persisted as { tracked?: unknown } | undefined)?.tracked, (x): x is TrackedAchievement => isObj(x) && typeof x.gameId === "string" && typeof x.achievementId === "string" && typeof x.name === "string" && typeof x.gameTitle === "string", [], 50),
      }),
    },
  ),
);
