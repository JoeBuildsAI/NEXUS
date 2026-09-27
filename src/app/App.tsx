import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
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
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkeys";
import { setupActions } from "@/core/actions/setup";
import { getProviders } from "@/providers";
import { isDevBuild } from "@/state/devStore";
import { cn } from "@/lib/utils";

setupActions();

export function App() {
  const bootPhase = useNavigationStore((s) => s.bootPhase);
  const setBootPhase = useNavigationStore((s) => s.setBootPhase);
  const startTelemetry = useTelemetryStore((s) => s.start);
  const reducedMotion = useSettingsStore((s) => s.appearance.reducedMotion);
  const glass = useSettingsStore((s) => s.appearance.glassIntensity);
  const onboardingComplete = useSettingsStore((s) => s.profile.onboardingComplete);
  const setDevPanelOpen = useSettingsStore((s) => s.setDevPanelOpen);

  useGlobalHotkeys();

  useEffect(() => {
    startTelemetry();
    // Warm the application index early so the palette is instant.
    void getProviders().apps.getApps();
    return () => useTelemetryStore.getState().stop();
  }, [startTelemetry]);

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
  );
}
