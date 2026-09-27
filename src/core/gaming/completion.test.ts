import { describe, expect, it } from "vitest";
import { bucketFor, closestAchievements, libraryTotals } from "./completion";
import { DEMO_GAMES } from "@/core/demo/games";
import type { GameDetails } from "@/core/types";

const wwht = DEMO_GAMES.find((g) => g.id === "wwht")!;
const portal = DEMO_GAMES.find((g) => g.id === "portal2")!;

describe("completion engine", () => {
  it("buckets by completion percentage", () => {
    expect(bucketFor(portal)).toBe("completed");
    expect(bucketFor(wwht)).toBe("near");
    const noData: GameDetails = { ...wwht, achievements: { gameId: "x", unlocked: 0, total: 0, achievements: [], status: "not-configured" } };
    expect(bucketFor(noData)).toBe("unknown");
  });

  it("closest = tracked first, then most commonly unlocked locked achievements; never invents progress", () => {
    const list = closestAchievements(wwht, "wwht_20");
    expect(list[0]?.achievement.id).toBe("wwht_20");
    expect(list[0]?.reason).toBe("tracked");
    expect(list.slice(1).every((e) => e.reason === "most-common")).toBe(true);
    // Most-common ordering: Kings & Pawns (22.4%) before Speedrunner (6.8%).
    expect(list[1]?.achievement.id).toBe("wwht_18");
    // Hidden locked achievements are not suggested unless tracked.
    expect(list.some((e) => e.achievement.hidden && e.reason !== "tracked")).toBe(false);
  });

  it("library totals only count games with achievement data", () => {
    const t = libraryTotals(DEMO_GAMES);
    expect(t.games).toBe(DEMO_GAMES.length);
    expect(t.completed).toBe(1);
    expect(t.total).toBeGreaterThan(0);
  });
});
