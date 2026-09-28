import { useEffect } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { BootSequence } from "@/components/shell/BootSequence";
import { TitleBar } from "@/components/shell/TitleBar";
import { NavRail } from "@/components/shell/NavRail";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { PrivacyVeil } from "@/components/shell/PrivacyVeil";
import { ToastHost } from "@/components/shell/ToastHost";
import { ModePreviewDialog, ModeTransitionOverlay } from "@/components/shell/ModeOverlay";
import { Onboarding } from "@/components/shell/Onboarding";
import { DevPanel } from "@/components/shell/DevPanel";
import { ConfirmDialog } from "@/components/ui";
import { ScreenRouter } from "@/app/ScreenRouter";
import { useNavigationStore } from "@/state/navigationStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useModeStore } from "@/state/modeStore";
import { isWindowActive, telemetryInterval, useWindowStore, wireWindowActivity } from "@/state/windowStore";
import { useCleanupStore } from "@/state/cleanupStore";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkeys";
import { useNativeEvents } from "@/hooks/useNativeEvents";
import { useReminders } from "@/hooks/useReminders";
import { useAutoBackup } from "@/hooks/useAutoBackup";
import { useExternalGameWatch } from "@/hooks/useExternalGameWatch";
import { useLifeStore } from "@/state/lifeStore";
import { setupActions } from "@/core/actions/setup";
import { getProviders } from "@/providers";
import { isDevBuild } from "@/state/devStore";
import { cn } from "@/lib/utils";

setupActions();

export function App() {
  const bootPhase = useNavigationStore((s) => s.bootPhase);
  const setBootPhase = useNavigationStore((s) => s.setBootPhase);
  const startTelemetry = useTelemetryStore((s) => s.start);
  const reducedSetting = useSettingsStore((s) => s.appearance.reducedMotion);
  const osReducedMotion = useWindowStore((s) => s.osReducedMotion);
  const reducedMotion = reducedSetting || osReducedMotion;
  const glass = useSettingsStore((s) => s.appearance.glassIntensity);
  const onboardingComplete = useSettingsStore((s) => s.profile.onboardingComplete);
  const setDevPanelOpen = useSettingsStore((s) => s.setDevPanelOpen);

  useGlobalHotkeys();
  useNativeEvents();
  useReminders();
  useAutoBackup();
  useExternalGameWatch();
  useEffect(() => { void useLifeStore.getState().load(); }, []);

  const gameRunning = useModeStore((s) => s.gameRunning);
  const gamingMode = useModeStore((s) => s.current === "gaming");
  const screen = useNavigationStore((s) => s.screen);
  const active = useWindowStore(isWindowActive);
  useEffect(() => wireWindowActivity(), []);
  const interval = telemetryInterval({ active, gameRunning, gamingMode, screen });

  useEffect(() => {
    // Fast only when live numbers are on screen; a game or a background window polls rarely.
    useTelemetryStore.getState().stop();
    startTelemetry(interval);
    return () => useTelemetryStore.getState().stop();
  }, [startTelemetry, interval]);

  useEffect(() => {
    const p = getProviders();
    // Warm the application index early so the palette is instant.
    void p.apps.getApps();
    // Re-grant access to previously authorized media roots (desktop only).
    void p.media.getAuthorizedRoots().catch(() => undefined);
    // Crash recovery: restore anything a previous Gaming Mode session changed.
    void useModeStore.getState().recoverStaleSession();
    // Progressive, non-blocking: cleanup discovery well after the shell is interactive.
    const t = setTimeout(() => void useCleanupStore.getState().discover(), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Suppress the WebView's generic context menu except where text editing/selection makes sense.
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [data-selectable='true'], [contenteditable='true']")) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  useEffect(() => {
    if (!isDevBuild) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDevPanelOpen(!useSettingsStore.getState().devPanelOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDevPanelOpen]);

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
    <div
      className={cn("relative h-screen w-screen overflow-hidden", reducedMotion && "reduce-motion")}
      style={{ ["--glass-alpha" as string]: (glass / 100).toFixed(2) }}
    >
      <AmbientBackground />

      <AnimatePresence>
        {bootPhase === "booting" && <BootSequence onComplete={() => setBootPhase("ready")} />}
      </AnimatePresence>

      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <NavRail />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <ScreenRouter />
          </main>
        </div>
      </div>

      {bootPhase === "ready" && !onboardingComplete && <Onboarding />}
      <CommandPalette />
      <ModePreviewDialog />
      <ModeTransitionOverlay />
      <ConfirmDialog />
      <ToastHost />
      <PrivacyVeil />
      <DevPanel />
    </div>
    </MotionConfig>
  );
}
