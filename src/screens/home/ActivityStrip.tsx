import { useTelemetryStore } from "@/state/telemetryStore";
import { useModeStore } from "@/state/modeStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { HEALTH_META } from "@/core/safety/health";
import { cn } from "@/lib/utils";

/** Contextual status strip: SYSTEM NOMINAL · NETWORK ACTIVE · … */
export function ActivityStrip() {
  const s = useTelemetryStore((st) => st.snapshot);
  const mode = useModeStore((m) => m.current);
  const approved = useProcessPrefsStore((p) => Object.values(p.prefs).filter((x) => x === "suspend").length);

  if (!s) return null;
  const health = HEALTH_META[s.health];
  const netActive = s.network.downBytesPerSec + s.network.upBytesPerSec > 20_000;

  const items: { text: string; tone?: "ok" | "warn" | "muted" }[] = [
    { text: `SYSTEM ${health.label.toUpperCase()}`, tone: health.tone === "nominal" ? "ok" : "warn" },
    { text: s.network.online ? (netActive ? "NETWORK ACTIVE" : "NETWORK IDLE") : "NETWORK OFFLINE", tone: s.network.online ? "ok" : "warn" },
    { text: `${s.processCount} PROCESSES` },
    { text: `${approved} APPROVED BACKGROUND APP${approved === 1 ? "" : "S"}`, tone: "muted" },
    { text: mode === "normal" ? "NO ACTION REQUIRED" : `${mode.toUpperCase()} MODE ACTIVE`, tone: mode === "normal" ? "muted" : "ok" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] tracking-wide2">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              it.tone === "ok" && "bg-status-nominal shadow-[0_0_8px_rgba(94,230,161,0.8)]",
              it.tone === "warn" && "bg-status-attention shadow-[0_0_8px_rgba(230,207,94,0.8)]",
              (!it.tone || it.tone === "muted") && "bg-white/25",
            )}
          />
          <span className={it.tone === "muted" ? "text-white/35" : "text-white/60"}>{it.text}</span>
        </span>
      ))}
    </div>
  );
}
