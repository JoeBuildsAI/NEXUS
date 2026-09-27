import {
  Gamepad2,
  LayoutDashboard,
  Mail,
  MonitorCog,
  Play,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigationStore, type Screen } from "@/state/navigationStore";
import { cn } from "@/lib/utils";

interface NavItem {
  screen: Screen;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { screen: "home", label: "Home", icon: LayoutDashboard },
  { screen: "gaming", label: "Gaming", icon: Gamepad2 },
  { screen: "media", label: "Media", icon: Play },
  { screen: "system", label: "System", icon: MonitorCog },
  { screen: "communications", label: "Comms", icon: Mail },
];

/** Integrated vertical navigation rail with animated active indicator. */
export function NavRail() {
  const screen = useNavigationStore((s) => s.screen);
  const navigate = useNavigationStore((s) => s.navigate);
  const openPalette = useNavigationStore((s) => s.openCommandPalette);

  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 py-3">
      <button
        onClick={openPalette}
        aria-label="Open command palette"
        className="no-drag group mb-2 flex h-11 w-11 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/50 transition-all hover:border-accent/40 hover:text-accent"
      >
        <Search size={17} />
        <span className="mt-0.5 text-[8px] uppercase tracking-wide2 opacity-60">
          ⌘Spc
        </span>
      </button>

      <div className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.screen}
            item={item}
            active={screen === item.screen}
            onClick={() => navigate(item.screen)}
          />
        ))}
      </div>

      <NavButton
        item={{ screen: "settings", label: "Settings", icon: Settings }}
        active={screen === "settings"}
        onClick={() => navigate("settings")}
      />
    </nav>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "no-drag group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors",
        active ? "text-accent" : "text-white/45 hover:text-white/80",
      )}
    >
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl border border-accent/30 bg-accent/[0.08] shadow-glow-sm"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon size={19} className="relative z-10" />
      <span className="relative z-10 text-[9px] font-medium uppercase tracking-wide2">
        {item.label}
      </span>
    </button>
  );
}
