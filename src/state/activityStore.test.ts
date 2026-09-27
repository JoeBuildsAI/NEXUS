import { beforeEach, describe, expect, it } from "vitest";
import { useActivityStore } from "./activityStore";
import { useSettingsStore } from "./settingsStore";

describe("activity history", () => {
  beforeEach(() => {
    useActivityStore.setState({ entries: [] });
    useSettingsStore.getState().setSystem({ activityHistory: true });
  });

  it("records newest-first with a hard cap", () => {
    const s = useActivityStore.getState();
    for (let i = 0; i < 205; i++) s.record("mode-entered", `entry ${i}`);
    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(200);
    expect(entries[0]!.text).toBe("entry 204");
  });

  it("records nothing when history is disabled", () => {
    useSettingsStore.getState().setSystem({ activityHistory: false });
    useActivityStore.getState().record("game-launched", "Launched X");
    expect(useActivityStore.getState().entries).toEqual([]);
  });

  it("bounds text length and can be cleared", () => {
    useActivityStore.getState().record("cleanup-completed", "x".repeat(500));
    expect(useActivityStore.getState().entries[0]!.text).toHaveLength(140);
    useActivityStore.getState().clear();
    expect(useActivityStore.getState().entries).toEqual([]);
  });
});
