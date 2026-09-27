import { Gamepad2, House, Mail, MonitorCog, Play, Search, Settings, type LucideIcon } from "lucide-react";
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
  { screen: "home", label: "Home", icon: House, key: "1" },
  { screen: "gaming", label: "Gaming", icon: Gamepad2, key: "2" },
  { screen: "media", label: "Media", icon: Play, key: "3" },
  { screen: "system", label: "System", icon: MonitorCog, key: "4" },
  { screen: "communications", label: "Communications", icon: Mail, key: "5" },
];

/**
 * Icon-only rail. Labels reveal on hover of the rail; the active item is white
 * with a single hairline indicator that travels between items.
 */
export function NavRail() {
  const screen = useNavigationStore((s) => s.screen);
  const navigate = useNavigationStore((s) => s.navigate);
  const openPalette = useNavigationStore((s) => s.openCommandPalette);
  const health = useTelemetryStore((s) => s.snapshot?.health ?? "nominal");
  const tone = HEALTH_META[health].tone;

  return (
    <nav className="group/rail relative z-20 flex w-[68px] shrink-0 flex-col items-center py-2" aria-label="Primary">
      <button
        onClick={openPalette}
        aria-label="Command palette (Ctrl+Space)"
        title="Ctrl+Space"
        className="no-drag mb-4 flex h-10 w-10 items-center justify-center rounded-md text-white/40 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
      >
        <Search size={17} strokeWidth={1.75} />
      </button>

      <div className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.screen} item={item} active={screen === item.screen} onClick={() => navigate(item.screen)} />
        ))}
      </div>

      <span
        className={cn(
          "mb-4 h-1 w-1 rounded-full",
          tone === "nominal" && "bg-white/40",
          tone === "attention" && "bg-status-attention",
          tone === "warning" && "bg-status-warning",
          tone === "critical" && "bg-status-critical",
        )}
        title={`System ${HEALTH_META[health].label}`}
      />

      <NavButton item={{ screen: "settings", label: "Settings", icon: Settings, key: "6" }} active={screen === "settings"} onClick={() => navigate("settings")} />
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
      className={cn(
        "no-drag relative flex h-12 w-12 items-center justify-center rounded-md transition-colors duration-200",
        active ? "text-white" : "text-white/35 hover:text-white/80",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute left-[-10px] top-1/2 h-5 w-px -translate-y-1/2 bg-white"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      )}
      <Icon size={19} strokeWidth={active ? 2 : 1.6} className="relative" />
      {/* Hover label */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[56px] whitespace-nowrap rounded-sm bg-[#0e0e10] px-2.5 py-1 text-[11.5px] tracking-wide text-white/85 opacity-0 shadow-lift transition-all duration-150 group-hover/rail:delay-75 [button:hover>&]:opacity-100 [button:hover>&]:translate-x-0 -translate-x-1"
      >
        {item.label}
        <span className="ml-2 font-mono text-[10px] text-white/35">⌃{item.key}</span>
      </span>
    </button>
  );
}
