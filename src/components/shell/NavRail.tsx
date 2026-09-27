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
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { cn } from "@/lib/utils";

interface NavItem {
  screen: Screen;
  label: string;
  icon: LucideIcon;
  key: string;
}

const NAV_ITEMS: NavItem[] = [
  { screen: "home", label: "Home", icon: LayoutDashboard, key: "1" },
  { screen: "gaming", label: "Gaming", icon: Gamepad2, key: "2" },
  { screen: "media", label: "Media", icon: Play, key: "3" },
  { screen: "system", label: "System", icon: MonitorCog, key: "4" },
  { screen: "communications", label: "Comms", icon: Mail, key: "5" },
];

/** Integrated vertical navigation rail with animated active indicator. */
export function NavRail() {
  const screen = useNavigationStore((s) => s.screen);
  const navigate = useNavigationStore((s) => s.navigate);
  const openPalette = useNavigationStore((s) => s.openCommandPalette);
  const health = useTelemetryStore((s) => s.snapshot?.health ?? "nominal");
  const tone = HEALTH_META[health].tone;

  return (
    <nav className="relative flex w-[84px] shrink-0 flex-col items-center gap-1 py-3">
      <div className="absolute inset-y-6 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />

      <button
        onClick={openPalette}
        aria-label="Open command palette (Ctrl+Space)"
        title="Command palette · Ctrl+Space"
        className="no-drag group mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/50 transition-all hover:border-accent/40 hover:text-accent hover:shadow-glow-sm"
      >
        <Search size={17} />
      </button>

      <div className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.screen} item={item} active={screen === item.screen} onClick={() => navigate(item.screen)} />
        ))}
      </div>

      <div className="mb-3 flex flex-col items-center gap-1" title={`System ${HEALTH_META[health].label}`}>
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "nominal" && "bg-status-nominal shadow-[0_0_10px_rgba(94,230,161,0.9)]",
            tone === "attention" && "bg-status-attention shadow-[0_0_10px_rgba(230,207,94,0.9)]",
            tone === "warning" && "bg-status-warning shadow-[0_0_10px_rgba(230,161,94,0.9)]",
            tone === "critical" && "bg-status-critical shadow-[0_0_10px_rgba(230,94,111,0.9)]",
          )}
        />
      </div>

      <NavButton
        item={{ screen: "settings", label: "Settings", icon: Settings, key: "6" }}
        active={screen === "settings"}
        onClick={() => navigate("settings")}
      />
    </nav>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      title={`${item.label} · Ctrl+${item.key}`}
      className={cn(
        "no-drag group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors",
        active ? "text-accent" : "text-white/40 hover:text-white/85",
      )}
    >
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl bg-accent/[0.08]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        >
          <span className="absolute -left-[15px] top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgba(94,208,230,0.9)]" />
        </motion.div>
      )}
      <Icon size={19} className="relative z-10 transition-transform group-hover:scale-105" />
      <span className="relative z-10 text-[9px] font-medium uppercase tracking-wide2">{item.label}</span>
    </button>
  );
}
