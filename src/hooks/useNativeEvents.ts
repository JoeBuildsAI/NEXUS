import { useEffect } from "react";
import { config } from "@/core/config";
import { actionRegistry } from "@/core/actions/registry";
import { useSettingsStore } from "@/state/settingsStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useModeStore } from "@/state/modeStore";

/**
 * Native ↔ frontend glue that must exist exactly once:
 *  - tray menu actions (Gaming/Normal mode, Privacy)
 *  - close-button behavior mirrored into native state
 *  - wake/focus recovery: restart telemetry polling after sleep so the first
 *    sample after wake is fresh and stale intervals never multiply
 */
export function useNativeEvents() {
  const closeBehavior = useSettingsStore((s) => s.window.closeBehavior);

  useEffect(() => {
    if (!config.isTauri) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("nexus:tray", (e) => {
        const id = e.payload;
        if (id === "privacy") usePrivacyStore.getState().activate("tray");
        else if (id === "mode:gaming") useModeStore.getState().requestMode("gaming");
        else if (id === "mode:normal") void useModeStore.getState().enterMode("normal");
        else void actionRegistry.execute("navigate", { args: { screen: "home" } });
      }).then((u) => (cancelled ? u() : (unlisten = u))),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!config.isTauri) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_close_behavior", { behavior: closeBehavior }).catch(() => undefined));
  }, [closeBehavior]);

  useEffect(() => {
    // After the machine sleeps, timers fire in a burst on wake. Restart the
    // telemetry loop on visibility/focus so the interval is clean.
    let lastTick = Date.now();
    const check = () => {
      const now = Date.now();
      if (now - lastTick > 30_000) {
        const t = useTelemetryStore.getState();
        t.stop();
        t.start(useModeStore.getState().gameRunning ? 6000 : 1500);
      }
      lastTick = now;
    };
    const id = setInterval(() => { lastTick = Date.now(); }, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
}
