import { useEffect } from "react";
import { config } from "@/core/config";
import { actionRegistry } from "@/core/actions/registry";
import { useSettingsStore } from "@/state/settingsStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useModeStore } from "@/state/modeStore";
import { notify } from "@/state/toastStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("native");

/**
 * Native ↔ frontend glue that must exist exactly once:
 *  - tray menu actions (Gaming/Normal mode, Privacy)
 *  - close-button behavior mirrored into native state
 *  - wake/focus recovery: restart telemetry polling after sleep so the first
 *    sample after wake is fresh and stale intervals never multiply
 */
export function useNativeEvents() {
  const closeBehavior = useSettingsStore((s) => s.window.closeBehavior);
  const preferredGpu = useSettingsStore((s) => s.system.preferredGpu);

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
    if (!config.isTauri) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("gpu_set_preferred", { luid: preferredGpu }).catch(() => undefined));
  }, [preferredGpu]);

  // Autostart registration is applied wherever the setting changes and VERIFIED
  // against the plugin: if Windows refused, the setting reverts so the UI never
  // claims a registration that does not exist.
  const launchOnLogin = useSettingsStore((s) => s.startup.launchOnLogin);
  useEffect(() => {
    if (!config.isTauri) return;
    let cancelled = false;
    (async () => {
      try {
        const autostart = await import("@tauri-apps/plugin-autostart");
        const enabled = await autostart.isEnabled();
        if (enabled !== launchOnLogin) {
          if (launchOnLogin) await autostart.enable();
          else await autostart.disable();
        }
        const actual = await autostart.isEnabled();
        if (!cancelled && actual !== launchOnLogin) {
          useSettingsStore.getState().setStartup({ launchOnLogin: actual });
          notify.warn("Autostart not applied", actual ? "Windows kept NEXUS registered at login." : "Windows refused the login registration.");
        }
      } catch (err) {
        log.warn("autostart apply failed", { error: String(err) });
        if (!cancelled) {
          useSettingsStore.getState().setStartup({ launchOnLogin: false });
          notify.warn("Autostart unavailable", "Could not change the login registration on this machine.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [launchOnLogin]);

  // Re-grant the chosen background image to the asset scope (grants are per-process).
  const backgroundImage = useSettingsStore((s) => s.appearance.backgroundImage);
  useEffect(() => {
    if (!config.isTauri || !backgroundImage) return;
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke<string>("background_register", { path: backgroundImage }).catch(() => useSettingsStore.getState().setAppearance({ backgroundImage: null })),
    );
  }, [backgroundImage]);

  // Autostart always launches with --minimized (hidden by the native layer). If the
  // user did NOT ask to start minimized, reveal the window once the shell is ready.
  useEffect(() => {
    if (!config.isTauri) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const flags = await invoke<{ minimized: boolean }>("launch_flags");
        if (flags.minimized && !useSettingsStore.getState().startup.startMinimized) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const w = getCurrentWindow();
          await w.show();
          await w.setFocus();
        }
      } catch {
        /* window API unavailable */
      }
    })();
  }, []);

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
