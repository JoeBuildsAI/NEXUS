import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModeStore } from "./modeStore";
import { useSettingsStore } from "./settingsStore";
import { useProcessPrefsStore } from "./processPrefsStore";
import { native, type SessionRecord } from "@/providers/system/nativeBridge";

const BALANCED = "381b4222-f694-41f0-9685-ff5bb260df2e";
const HIGH = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

/** In-memory stand-in for the native layer: power plans, process closes, session file. */
function fakeNative(opts: { active?: string; schemes?: { guid: string; name: string }[]; supported?: boolean; setFails?: boolean; running?: string[] } = {}) {
  const state = {
    active: opts.active ?? BALANCED,
    schemes: opts.schemes ?? [{ guid: BALANCED, name: "Balanced" }, { guid: HIGH, name: "High performance" }],
    supported: opts.supported ?? true,
    session: null as SessionRecord | null,
    running: new Set((opts.running ?? []).map((r) => r.toLowerCase())), // taskkill /IM is case-insensitive
    setCalls: [] as string[],
    closeCalls: [] as string[],
  };
  vi.spyOn(native, "powerState").mockImplementation(async () => ({ supported: state.supported, activeGuid: state.active, schemes: state.schemes.map((sc) => ({ ...sc, active: sc.guid === state.active })) }));
  vi.spyOn(native, "powerSetActive").mockImplementation(async (guid: string) => {
    state.setCalls.push(guid);
    if (opts.setFails) return false;
    state.active = guid;
    return true;
  });
  vi.spyOn(native, "closeGraceful").mockImplementation(async (name: string) => {
    state.closeCalls.push(name);
    const was = state.running.delete(name.toLowerCase());
    return { ok: true, count: was ? 1 : 0 };
  });
  vi.spyOn(native, "sessionRead").mockImplementation(async () => state.session);
  vi.spyOn(native, "sessionWrite").mockImplementation(async (r: SessionRecord) => { state.session = r; });
  vi.spyOn(native, "sessionClear").mockImplementation(async () => { state.session = null; });
  return state;
}

describe("Gaming Mode transaction semantics", () => {
  beforeEach(() => {
    useModeStore.setState({ current: "normal", session: null, history: [], transition: null, preview: null, gameRunning: false, previousPowerGuid: null, powerSupported: null });
    useSettingsStore.getState().setSystem({ safety: "enabled", allowProcessManagement: true });
    useSettingsStore.getState().setAppearance({ reducedMotion: true }); // no step delays in tests
    useProcessPrefsStore.setState({ prefs: { "Spotify.exe": "close", "Discord.exe": "close" } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("captures the previous plan, applies HIGH, persists a recoverable session, and restores only what it changed", async () => {
    const n = fakeNative({ running: ["Spotify.exe"] }); // Discord already closed
    await useModeStore.getState().enterMode("gaming");
    expect(n.active).toBe(HIGH);
    expect(n.session?.previousPowerGuid).toBe(BALANCED);
    expect(n.session?.closedApps).toEqual(["spotify.exe"]); // Discord was not running → not recorded
    expect(useModeStore.getState().current).toBe("gaming");

    await useModeStore.getState().exitToNormal();
    expect(n.active).toBe(BALANCED);
    expect(n.setCalls).toEqual([HIGH, BALANCED]);
    expect(n.session).toBeNull();
    expect(useModeStore.getState().previousPowerGuid).toBeNull();
  });

  it("does not touch the power plan when HIGH is already active", async () => {
    const n = fakeNative({ active: HIGH });
    await useModeStore.getState().enterMode("gaming");
    expect(n.setCalls).toEqual([]);
    expect(useModeStore.getState().previousPowerGuid).toBeNull();
    await useModeStore.getState().exitToNormal();
    expect(n.setCalls).toEqual([]); // nothing to restore
  });

  it("a failed power switch is not recorded as a change, so exit never 'restores' it", async () => {
    const n = fakeNative({ setFails: true });
    await useModeStore.getState().enterMode("gaming");
    expect(useModeStore.getState().previousPowerGuid).toBeNull();
    await useModeStore.getState().exitToNormal();
    expect(n.setCalls).toEqual([HIGH]); // one attempt, no restore attempt
  });

  it("observe-only safety records steps but mutates nothing", async () => {
    useSettingsStore.getState().setSystem({ safety: "observe" });
    const n = fakeNative({ running: ["Spotify.exe"] });
    await useModeStore.getState().enterMode("gaming");
    expect(n.setCalls).toEqual([]);
    expect(n.closeCalls).toEqual([]);
    expect(n.running.has("spotify.exe")).toBe(true);
    expect(useModeStore.getState().current).toBe("gaming");
  });

  it("crash recovery restores the recorded plan once and clears the session file", async () => {
    const n = fakeNative({ active: HIGH });
    n.session = { mode: "gaming", startedAt: Date.now() - 60_000, previousPowerGuid: BALANCED, closedApps: ["Spotify.exe"], startupChanges: [] };
    expect(await useModeStore.getState().recoverStaleSession()).toBe(true);
    expect(n.active).toBe(BALANCED);
    expect(n.session).toBeNull();
    expect(await useModeStore.getState().recoverStaleSession()).toBe(false); // idempotent
  });

  it("unsupported power control is reported, never faked", async () => {
    const n = fakeNative({ supported: false, schemes: [] });
    await useModeStore.getState().enterMode("gaming");
    expect(n.setCalls).toEqual([]);
    expect(useModeStore.getState().current).toBe("gaming");
  });
});
