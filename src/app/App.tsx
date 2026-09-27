import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { BootSequence } from "@/components/shell/BootSequence";
import { TitleBar } from "@/components/shell/TitleBar";
import { NavRail } from "@/components/shell/NavRail";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { PrivacyVeil } from "@/components/shell/PrivacyVeil";
import { ConfirmDialog } from "@/components/ui";
import { ScreenRouter } from "@/app/ScreenRouter";
import { useNavigationStore } from "@/state/navigationStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkeys";
import { setupActions } from "@/core/actions/setup";
import { cn } from "@/lib/utils";

setupActions();

export function App() {
  const bootPhase = useNavigationStore((s) => s.bootPhase);
  const setBootPhase = useNavigationStore((s) => s.setBootPhase);
  const startTelemetry = useTelemetryStore((s) => s.start);
  const reducedMotion = useSettingsStore((s) => s.appearance.reducedMotion);

  useGlobalHotkeys();

  useEffect(() => {
    startTelemetry();
    return () => useTelemetryStore.getState().stop();
  }, [startTelemetry]);

  return (
    <div className={cn("relative h-screen w-screen overflow-hidden", reducedMotion && "reduce-motion")}>
      <AmbientBackground />

      <AnimatePresence>
        {bootPhase === "booting" && (
          <BootSequence onComplete={() => setBootPhase("ready")} />
        )}
      </AnimatePresence>

      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <NavRail />
          <main className="min-h-0 flex-1 overflow-hidden pr-3 pb-3">
            <div className="glass h-full overflow-hidden rounded-2xl">
              <ScreenRouter />
            </div>
          </main>
        </div>
      </div>

      <CommandPalette />
      <ConfirmDialog />
      <PrivacyVeil />
    </div>
  );
}
