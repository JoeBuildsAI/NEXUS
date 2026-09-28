import { create } from "zustand";
import { config } from "@/core/config";

/**
 * Whether the user can actually see / is using NEXUS. WebView2 keeps
 * `document.hasFocus()` true while the host window sits behind a fullscreen
 * game, so the native window focus events are the source of truth.
 */
interface WindowState {
  focused: boolean;
  visible: boolean;
  /** Windows "Animation effects" off (prefers-reduced-motion). */
  osReducedMotion: boolean;
  set: (patch: Partial<Pick<WindowState, "focused" | "visible" | "osReducedMotion">>) => void;
}

const reducedQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export const useWindowStore = create<WindowState>((set) => ({
  focused: typeof document === "undefined" ? true : document.hasFocus(),
  visible: typeof document === "undefined" ? true : !document.hidden,
  osReducedMotion: reducedQuery?.matches ?? false,
  set: (patch) => set(patch),
}));

/** True when NEXUS is in front of the user (focused and visible). */
export const isWindowActive = (s: Pick<WindowState, "focused" | "visible">) => s.focused && s.visible;

/** Telemetry cadence: fast only when someone is looking at live numbers. */
export function telemetryInterval(o: { active: boolean; gameRunning: boolean; gamingMode: boolean; screen: string }): number {
  if (o.gameRunning || o.gamingMode) return 6000;
  if (!o.active) return 10_000;
  return o.screen === "system" ? 1500 : 5000;
}

let wired = false;
/** Subscribe once to native focus + document visibility. */
export function wireWindowActivity(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  const store = useWindowStore.getState();
  document.addEventListener("visibilitychange", () => store.set({ visible: !document.hidden }));
  window.addEventListener("focus", () => store.set({ focused: true }));
  window.addEventListener("blur", () => store.set({ focused: false }));
  reducedQuery?.addEventListener?.("change", (e) => store.set({ osReducedMotion: e.matches }));
  if (!config.isTauri) return;
  void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
    const w = getCurrentWindow();
    store.set({ focused: await w.isFocused().catch(() => true), visible: await w.isVisible().catch(() => true) });
    await w.onFocusChanged(({ payload }) => store.set({ focused: payload }));
  }).catch(() => undefined);
}
