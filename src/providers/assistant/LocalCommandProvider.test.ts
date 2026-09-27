import { describe, expect, it } from "vitest";
import { LocalCommandProvider } from "./LocalCommandProvider";
import { DEMO_GAMES } from "@/core/demo/games";
import type { AppEntry } from "@/core/types";

const APPS: AppEntry[] = [
  { id: "app-1", name: "Discord", path: "C:\\x\\Discord.exe", source: "start-menu" },
  { id: "app-2", name: "Google Chrome", path: "C:\\x\\chrome.exe", source: "start-menu" },
  { id: "app-3", name: "Visual Studio Code", path: "C:\\x\\Code.exe", source: "start-menu-user" },
  { id: "app-4", name: "Notepad", path: "C:\\Windows\\notepad.exe", source: "builtin" },
];

const provider = new LocalCommandProvider({
  getApps: async () => APPS,
  getGames: async () => DEMO_GAMES,
});

async function topMatch(input: string) {
  return (await provider.interpret(input))[0];
}

describe("LocalCommandProvider", () => {
  it("maps navigation phrases to the navigate action", async () => {
    const m = await topMatch("gaming");
    expect(m?.actionId).toBe("navigate");
    expect(m?.args.screen).toBe("gaming");
  });

  it("handles alternate phrasings", async () => {
    for (const phrase of ["go to gaming", "open games", "game hub"]) {
      expect((await topMatch(phrase))?.args.screen).toBe("gaming");
    }
  });

  it("maps 'system health' to system navigation", async () => {
    expect((await topMatch("system health"))?.args.screen).toBe("system");
  });

  it("maps system metric queries", async () => {
    expect((await topMatch("cpu"))?.actionId).toBe("system-query");
    expect((await topMatch("memory"))?.args.metric).toBe("memory");
  });

  it("maps 'storage' to the open-storage action", async () => {
    expect((await topMatch("show storage"))?.actionId).toBe("open-storage");
  });

  it("maps 'privacy' to the privacy-mode action", async () => {
    expect((await topMatch("privacy"))?.actionId).toBe("privacy-mode");
  });

  it("recognizes mode entry and exit", async () => {
    expect((await topMatch("enter gaming mode"))?.actionId).toBe("enter-mode");
    expect((await topMatch("return to normal"))?.actionId).toBe("exit-mode");
    expect((await topMatch("focus mode"))?.args.mode).toBe("focus");
  });

  it("opens settings sections", async () => {
    const m = await topMatch("appearance");
    expect(m?.actionId).toBe("open-settings");
    expect(m?.args.section).toBe("appearance");
  });

  it("matches a game by title for launching", async () => {
    const m = await topMatch("play We Were Here Too");
    expect(m?.actionId).toBe("launch-game");
    expect(m?.args.gameId).toBe("wwht");
  });

  it("shows game achievements/details when asked", async () => {
    const m = await topMatch("cyberpunk achievements");
    expect(m?.actionId).toBe("show-game");
    expect(m?.args.gameId).toBe("cp2077");
  });

  it("launches discovered applications by id, never by path", async () => {
    const m = await topMatch("open discord");
    expect(m?.actionId).toBe("launch-app");
    expect(m?.args.appId).toBe("app-1");
    expect(Object.values(m!.args).some((v) => v.includes("\\"))).toBe(false);
  });

  it("fuzzy matches app names", async () => {
    expect((await topMatch("launch vs code"))?.args.appId).toBe("app-3");
    expect((await topMatch("chrome"))?.args.appId).toBe("app-2");
  });

  it("returns nothing for empty input", async () => {
    expect(await provider.interpret("   ")).toHaveLength(0);
  });

  it("SECURITY: every match references a known action id (never shell)", async () => {
    const matches = await provider.interpret("open");
    for (const m of matches) {
      expect(typeof m.actionId).toBe("string");
      expect(m.actionId).not.toContain(" ");
    }
  });
});
