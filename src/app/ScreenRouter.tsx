import { AnimatePresence, motion } from "framer-motion";
import { useNavigationStore } from "@/state/navigationStore";
import { HomeScreen } from "@/screens/home/HomeScreen";
import { GamingScreen } from "@/screens/gaming/GamingScreen";
import { MediaScreen } from "@/screens/media/MediaScreen";
import { SystemScreen } from "@/screens/system/SystemScreen";
import { CommunicationsScreen } from "@/screens/communications/CommunicationsScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";

const SCREENS = {
  home: HomeScreen,
  gaming: GamingScreen,
  media: MediaScreen,
  system: SystemScreen,
  communications: CommunicationsScreen,
  settings: SettingsScreen,
} as const;

export function ScreenRouter() {
  const screen = useNavigationStore((s) => s.screen);
  const Screen = SCREENS[screen];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={screen}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="h-full"
      >
        <Screen />
      </motion.div>
    </AnimatePresence>
  );
}
