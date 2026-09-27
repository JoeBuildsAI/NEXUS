import { describe, expect, it } from "vitest";
import { generateInsights } from "./insightEngine";
import { DEMO_GAMES } from "@/core/demo/games";
import { demoTelemetry } from "@/core/demo/system";
import { DEMO_CLEANUP_CANDIDATES } from "@/core/demo/storage";

const base = {
  telemetry: demoTelemetry(10),
  games: DEMO_GAMES,
  inbox: null,
  cleanup: DEMO_CLEANUP_CANDIDATES,
  approvedAppCount: 2,
  mode: "normal" as const,
  steamConnected: true,
  mediaConnected: true,
};

describe("insight engine", () => {
  it("reports near-complete games with the exact remaining count", () => {
    const out = generateInsights(base);
    const wwht = out.find((i) => i.id === "near-wwht");
    expect(wwht?.text).toContain("3 achievements from completing We Were Here Too");
  });

  it("surfaces storage pressure from telemetry", () => {
    const out = generateInsights({ ...base, telemetry: demoTelemetry(10, { storagePressure: true }) });
    expect(out[0]?.id).toBe("storage-pressure");
    expect(out[0]?.text).toMatch(/GB of temporary data can be reviewed/);
  });

  it("mentions gaming mode allowlist size", () => {
    const out = generateInsights(base);
    expect(out.find((i) => i.id === "gaming-ready")?.text).toContain("2 approved background applications");
  });

  it("does not suggest gaming mode while already in it", () => {
    const out = generateInsights({ ...base, mode: "gaming" });
    expect(out.find((i) => i.id === "gaming-ready")).toBeUndefined();
  });

  it("notes when Steam is offline", () => {
    const out = generateInsights({ ...base, steamConnected: false, games: [] });
    expect(out.some((i) => i.id === "steam")).toBe(true);
  });

  it("falls back to nominal when nothing is notable", () => {
    const out = generateInsights({ ...base, games: [], approvedAppCount: 0, cleanup: [] });
    expect(out.map((i) => i.id)).toContain("nominal");
  });
});

describe("contextual suggestions (Phase 5)", () => {
  const base = { telemetry: null, games: [], inbox: null, cleanup: [], approvedAppCount: 0, mode: "normal" as const, steamConnected: true, mediaConnected: true };
  it("points at achievement sync when Steam is detected without an API key", () => {
    const out = generateInsights({ ...base, steamDetectedNoApi: true });
    expect(out.find((i) => i.id === "steam-api")?.action?.args).toEqual({ section: "integrations" });
  });
  it("reports disconnected media sources without naming them", () => {
    const out = generateInsights({ ...base, mediaDisconnectedRoots: 2 });
    const text = out.find((i) => i.id === "media-disconnected")!.text;
    expect(text).toMatch(/2 media sources are currently disconnected/);
    expect(text).not.toContain(":" + String.fromCharCode(92));
  });
  it("suggests near-complete games only when nothing is tracked", () => {
    expect(generateInsights({ ...base, nearCompletion: 3 }).some((i) => i.id === "near-completion")).toBe(true);
    expect(generateInsights({ ...base, nearCompletion: 3, tracked: { gameId: "g", gameTitle: "G", name: "A" } }).some((i) => i.id === "near-completion")).toBe(false);
  });
});
