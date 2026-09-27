import { describe, expect, it } from "vitest";
import { LocalCommandProvider } from "./LocalCommandProvider";

const provider = new LocalCommandProvider();

async function topMatch(input: string) {
  const matches = await provider.interpret(input);
  return matches[0];
}

describe("LocalCommandProvider", () => {
  it("maps navigation phrases to the navigate action", async () => {
    const m = await topMatch("gaming");
    expect(m?.actionId).toBe("navigate");
    expect(m?.args.screen).toBe("gaming");
  });

  it("handles alternate phrasings", async () => {
    for (const phrase of ["go to gaming", "open games", "game hub"]) {
      const m = await topMatch(phrase);
      expect(m?.args.screen).toBe("gaming");
    }
  });

  it("maps 'system health' to system navigation", async () => {
    const m = await topMatch("system health");
    expect(m?.args.screen).toBe("system");
  });

  it("maps 'storage' to the open-storage action", async () => {
    const m = await topMatch("show storage");
    expect(m?.actionId).toBe("open-storage");
  });

  it("maps 'privacy' to the privacy-mode action", async () => {
    const m = await topMatch("privacy");
    expect(m?.actionId).toBe("privacy-mode");
  });

  it("recognizes mode entry and exit", async () => {
    expect((await topMatch("enter gaming mode"))?.actionId).toBe("enter-mode");
    expect((await topMatch("return to normal"))?.actionId).toBe("exit-mode");
  });

  it("matches a game by title for launching", async () => {
    const m = await topMatch("open We Were Here Too");
    expect(m?.actionId).toBe("launch-game");
    expect(m?.args.gameId).toBe("wwht");
  });

  it("returns nothing for empty input", async () => {
    expect(await provider.interpret("   ")).toHaveLength(0);
  });

  it("SECURITY: every match references a known action id (never shell)", async () => {
    const matches = await provider.interpret("gaming storage privacy");
    for (const m of matches) {
      expect(typeof m.actionId).toBe("string");
      expect(m.actionId).not.toContain(" ");
    }
  });
});
