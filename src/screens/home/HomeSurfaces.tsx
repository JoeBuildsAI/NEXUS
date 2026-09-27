import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronRight, Clock, Play, Sparkles, Trophy, HardDrive } from "lucide-react";
import { useNavigationStore } from "@/state/navigationStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useAsync } from "@/hooks/useAsync";
import { useInsights } from "@/hooks/useInsights";
import { getProviders } from "@/providers";
import { actionRegistry } from "@/core/actions/registry";
import type { ActionId } from "@/core/actions/types";
import { completionPercent, type GameDetails } from "@/core/types";
import { formatBytes, formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { isOffline } from "@/core/errors";
import { cn } from "@/lib/utils";

/* ---------- shared section header ---------- */
export function SectionLabel({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-cinematic text-white/30">{children}</p>
      {action && (
        <button onClick={onAction} className="group flex items-center gap-1 text-[11px] text-white/35 transition-colors hover:text-accent">
          {action}
          <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

/* ---------- Continue playing hero ---------- */
export function ContinuePlaying() {
  const navigate = useNavigationStore((s) => s.navigate);
  const selectGame = useNavigationStore((s) => s.selectGame);
  const { data, error } = useAsync<GameDetails | null>(async () => {
    const { steam } = getProviders();
    const games = await steam.getGames();
    const last = [...games].filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
    return last ? steam.getGameDetails(last.id) : null;
  }, []);

  if (error && isOffline(error)) {
    return (
      <div>
        <SectionLabel>Continue</SectionLabel>
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-sm text-white/40">
          <p className="text-white/70">Steam offline</p>
          <p className="mt-1 text-xs">Connect Steam in Integrations when this machine is ready.</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="h-[168px] animate-pulse rounded-2xl bg-white/[0.02]" />;

  const pct = completionPercent(data.achievements);
  return (
    <div>
      <SectionLabel action="Gaming" onAction={() => navigate("gaming")}>Continue</SectionLabel>
      <motion.button
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={() => { navigate("gaming"); selectGame(data.id); }}
        className="group relative block w-full overflow-hidden rounded-2xl text-left"
        style={{ minHeight: 168 }}
      >
        <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${data.coverColor} 0%, ${data.heroColor} 60%, #05070a 100%)` }} />
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-r from-void-950/80 via-void-950/40 to-transparent" />
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-50" style={{ background: data.coverColor }} />

        <div className="relative flex h-full flex-col justify-between p-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide2 text-white/50">
            <Clock size={11} /> Last played {data.lastPlayed ? formatRelativeTime(data.lastPlayed) : "—"}
          </div>
          <div className="mt-6 flex items-end justify-between gap-6">
            <div>
              <h3 className="font-display text-3xl font-bold tracking-wide text-white">{data.title}</h3>
              <div className="mt-2 flex items-center gap-4 text-sm text-white/60">
                <span>{formatPlaytime(data.playtimeMinutes)}</span>
                <span className="flex items-center gap-1.5"><Trophy size={13} className="text-ember" /> {data.achievements.unlocked} / {data.achievements.total}</span>
                <span className="font-mono text-accent">{pct}%</span>
              </div>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-void-950 shadow-glow transition-transform group-hover:scale-105">
              <Play size={20} className="ml-0.5" fill="currentColor" />
            </span>
          </div>
        </div>
      </motion.button>
    </div>
  );
}

/* ---------- Communications ---------- */
export function CommsSurface() {
  const navigate = useNavigationStore((s) => s.navigate);
  const { data, error } = useAsync(() => getProviders().email.getSummary(Date.now() - 3 * 24 * 3600 * 1000), []);
  return (
    <div>
      <SectionLabel action="Inbox" onAction={() => navigate("communications")}>Communications</SectionLabel>
      {error ? (
        <p className="text-sm text-white/40"><span className="text-white/70">Email disconnected.</span> Mock inbox unavailable.</p>
      ) : !data ? (
        <div className="h-16 animate-pulse rounded-lg bg-white/[0.02]" />
      ) : (
        <button onClick={() => navigate("communications")} className="group block w-full text-left">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl font-semibold tabular-nums text-white/95">{data.unread}</span>
            <span className="text-sm text-white/45">unread</span>
            <ArrowUpRight size={14} className="ml-auto text-white/20 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/60" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {data.important > 0 && <span className="text-status-attention">{data.important} potentially important</span>}
            {data.newsletters > 0 && <span className="text-white/45">{data.newsletters} newsletters</span>}
            {data.receipts > 0 && <span className="text-white/45">{data.receipts} receipts</span>}
          </div>
        </button>
      )}
    </div>
  );
}

/* ---------- Storage ---------- */
export function StorageSurface() {
  const navigate = useNavigationStore((s) => s.navigate);
  const setTab = useNavigationStore((s) => s.setSystemTab);
  const storage = useTelemetryStore((s) => s.snapshot?.storage);
  const drives = useMemo(() => storage?.filter((d) => d.kind === "fixed") ?? [], [storage]);
  const go = () => { navigate("system"); setTab("storage"); };
  return (
    <div>
      <SectionLabel action="Analyze" onAction={go}>Storage</SectionLabel>
      {drives.length === 0 ? (
        <p className="text-sm text-white/35">No fixed drives reported.</p>
      ) : (
        <button onClick={go} className="block w-full space-y-3 text-left">
          {drives.slice(0, 3).map((d) => {
            const used = d.totalBytes - d.freeBytes;
            const pct = d.totalBytes ? (used / d.totalBytes) * 100 : 0;
            const pressure = pct > 88;
            return (
              <div key={d.mountPoint}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/75"><HardDrive size={13} className="text-white/30" />{d.mountPoint} <span className="text-white/35">{d.label}</span></span>
                  <span className="font-mono text-xs text-white/50">{formatBytes(used, 0)} <span className="text-white/25">/ {formatBytes(d.totalBytes, 0)}</span></span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cn("h-full rounded-full transition-all duration-700", pressure ? "bg-status-warning" : "bg-status-nominal/80")} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </button>
      )}
    </div>
  );
}

/* ---------- Assistant insights ---------- */
const TONE_DOT = { neutral: "bg-white/30", accent: "bg-accent", attention: "bg-status-attention", warning: "bg-status-warning" } as const;

export function InsightsSurface() {
  const insights = useInsights();
  return (
    <div>
      <SectionLabel>
        <span className="flex items-center gap-1.5"><Sparkles size={11} className="text-accent/70" /> NEXUS suggests</span>
      </SectionLabel>
      <ul className="space-y-2.5">
        {insights.slice(0, 4).map((ins) => (
          <li key={ins.id} className="flex items-start gap-3 text-sm">
            <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[ins.tone])} />
            <p className="flex-1 leading-relaxed text-white/65">{ins.text}</p>
            {ins.action && (
              <button
                onClick={() => void actionRegistry.execute(ins.action!.actionId as ActionId, { args: ins.action!.args ?? {} })}
                className="shrink-0 rounded-md border border-white/[0.08] px-2 py-0.5 text-[11px] text-white/50 transition-colors hover:border-accent/40 hover:text-accent"
              >
                {ins.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Media (privacy-safe) ---------- */
export function MediaSurface() {
  const navigate = useNavigationStore((s) => s.navigate);
  return (
    <div>
      <SectionLabel action="Open" onAction={() => navigate("media")}>Media</SectionLabel>
      <button onClick={() => navigate("media")} className="group flex w-full items-center gap-4 text-left">
        <div className="grid w-24 shrink-0 grid-cols-3 gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-[2px] bg-white/[0.06] transition-colors group-hover:bg-accent/20" />
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white/75">Six-player workspace</p>
          <p className="text-xs text-white/35">Private · nothing from the library is shown here</p>
        </div>
      </button>
    </div>
  );
}
