import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameSessionStore } from "./gameSessionStore";
import { useLibraryStore } from "./libraryStore";
import { useModeStore } from "./modeStore";
import { native } from "@/providers/system/nativeBridge";

describe("game session tracking", () => {
  afterEach(() => { useGameSessionStore.getState().end(); vi.restoreAllMocks(); });

  it("an Xbox title launched from NEXUS is confirmed through its install folder", async () => {
    useLibraryStore.setState({ games: [{ id: "xbox:Studio.Core", title: "Shooter", steamAppId: null, launcher: "xbox", installed: true, installSizeBytes: null, playtimeMinutes: 0, lastPlayed: null, coverColor: "#111", heroColor: "#000", coverUrl: null, heroUrl: null, genres: [], installPath: "C:\\XboxGames\\Shooter" }] });
    const probe = vi.spyOn(native, "runningUnder").mockResolvedValue(true);
    useGameSessionStore.getState().begin("xbox:Studio.Core", "Shooter");
    await vi.waitFor(() => expect(useGameSessionStore.getState().phase).toBe("active"));
    expect(probe).toHaveBeenCalledWith("C:\\XboxGames\\Shooter");
    expect(useModeStore.getState().gameRunning).toBe(true);
  });
});
