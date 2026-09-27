import { motion } from "framer-motion";
import { useNavigationStore } from "@/state/navigationStore";
import { ErrorBoundary } from "@/components/ui";
import { TodayScreen } from "@/screens/today/TodayScreen";
import { CalendarScreen } from "@/screens/calendar/CalendarScreen";
import { LifeScreen } from "@/screens/life/LifeScreen";
import { GamingScreen } from "@/screens/gaming/GamingScreen";
import { MediaScreen } from "@/screens/media/MediaScreen";
import { SystemScreen } from "@/screens/system/SystemScreen";
import { CommunicationsScreen } from "@/screens/communications/CommunicationsScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";

const SCREENS = {
  home: { C: TodayScreen, label: "Today" },
  calendar: { C: CalendarScreen, label: "Calendar" },
  life: { C: LifeScreen, label: "Life" },
  gaming: { C: GamingScreen, label: "Play" },
  media: { C: MediaScreen, label: "Media" },
  system: { C: SystemScreen, label: "System" },
  communications: { C: CommunicationsScreen, label: "Communications" },
  settings: { C: SettingsScreen, label: "Settings" },
} as const;

/**
 * Screen router. Enter-only transition (no exit choreography) so navigation is
 * instant and can never stall on an unmounting screen.
 */
export function ScreenRouter() {
  const screen = useNavigationStore((s) => s.screen);
  const { C: Screen, label } = SCREENS[screen];

  return (
    <motion.div
      key={screen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <ErrorBoundary label={label}>
        <Screen />
      </ErrorBoundary>
    </motion.div>
  );
}
