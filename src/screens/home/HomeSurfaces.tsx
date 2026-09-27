import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Play, X } from "lucide-react";
import { useNavigationStore } from "@/state/navigationStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useAsync } from "@/hooks/useAsync";
import { useInsights } from "@/hooks/useInsights";
import { getProviders } from "@/providers";
import { actionRegistry } from "@/core/actions/registry";
import type { ActionId } from "@/core/actions/types";
import { completionPercent, type GameDetails } from "@/core/types";
import { formatBytes, formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { useLibraryStore } from "@/state/libraryStore";
import { useCleanupStore } from "@/state/cleanupStore";
import { useInsightPrefsStore } from "@/state/insightPrefsStore";
import { cn } from "@/lib/utils";

/* ---------- section label ---------- */
export function SectionLabel({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <p className="label">{children}</p>
      {action && (
        <button onClick={onAction} className="group flex items-center gap-1 text-micro text-white/30 transition-colors hover:text-white">
          {action}
          <ArrowUpRight size={11} className="transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
        </button>
      )}
    </div>
  );
}

/* ---------- Continue playing ---------- */
export function ContinuePlaying() {
  const navigate = useNavigationStore((s) => s.navigate);
  const selectGame = useNavigationStore((s) => s.selectGame);
  const [imgFailed, setImgFailed] = useState(false);
  const games = useLibraryStore((s) => s.games);
  const details = useLibraryStore((s) => s.details);
  const offline = useLibraryStore((s) => s.offline);
  const loadedAt = useLibraryStore((s) => s.loadedAt);
  const last = useMemo(() => [...games].filter((g) => g.installed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0], [games]);
  useEffect(() => {
    void useLibraryStore.getState().load();
  }, []);
  useEffect(() => {
    if (last) void useLibraryStore.getState().ensureDetails([last.id]);
  }, [last]);
  const data: GameDetails | null = last ? details[last.id]?.value ?? useLibraryStore.getState().withDetails().find((g) => g.id === last.id) ?? null : null;

  if (offline) {
    return (
      <div>
        <SectionLabel>Continue playing</SectionLabel>
        <p className="font-display text-display-sm text-white/70">Steam not connected</p>
        <p className="mt-1 text-sm text-white/35">NEXUS will detect Steam automatically when available.</p>
      </div>
    );
  }
  if (!data) {
    if (loadedAt && games.length === 0) return <div><SectionLabel>Continue playing</SectionLabel><p className="text-sm text-white/35">No installed games yet.</p></div>;
    return <div className="h-[220px] animate-pulse rounded-md bg-white/[0.02]" />;
  }

  const pct = completionPercent(data.achievements);
  const hasArt = !!data.heroUrl && !imgFailed;
  return (
    <div>
      <SectionLabel action="Gaming" onAction={() => navigate("gaming")}>Continue playing</SectionLabel>
      <motion.button
        whileHover="hover"
        onClick={() => { navigate("gaming"); selectGame(data.id); }}
        className="group relative block w-full overflow-hidden rounded-md text-left"
        style={{ minHeight: 220 }}
      >
        {/* Artwork bleeds into black */}
        <div className="absolute inset-0 bg-black">
          <motion.div variants={{ hover: { scale: 1.03 } }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0">
            {hasArt ? (
              <img src={data.heroUrl!} alt="" onError={() => setImgFailed(true)} className="h-full w-full object-cover opacity-80" />
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(70% 110% at 88% 15%, ${data.coverColor} 0%, transparent 60%)`, opacity: 0.4 }} />
            )}
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        </div>

        <div className="relative flex h-full min-h-[220px] flex-col justify-end p-7">
          <p className="text-micro text-white/40">{data.lastPlayed ? `Last played ${formatRelativeTime(data.lastPlayed)}` : "Installed"}</p>
          <h3 className="mt-2 font-display text-display-md font-semibold tracking-wide text-white">{data.title}</h3>
          <div className="mt-3 flex items-center gap-5 font-mono text-[12.5px] tabular text-white/55">
            {data.playtimeMinutes > 0 && <span>{formatPlaytime(data.playtimeMinutes)}</span>}
            {data.achievements.total > 0 && <span>{data.achievements.unlocked} / {data.achievements.total}</span>}
            {data.achievements.total > 0 && <span className="text-white/85">{pct}%</span>}
          </div>
          <span className="absolute bottom-7 right-7 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black opacity-90 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105">
            <Play size={16} className="ml-0.5" fill="currentColor" />
          </span>
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
        <p className="text-sm text-white/40">Offline. Connect an account when you're ready.</p>
      ) : !data ? (
        <div className="h-14 animate-pulse rounded bg-white/[0.02]" />
      ) : (
        <button onClick={() => navigate("communications")} className="block text-left">
          <p className="font-sans text-display-lg font-semibold tabular tracking-tight text-white">{data.unread}<span className="ml-3 font-sans text-base font-normal text-white/40">unread</span></p>
          <p className="mt-2 text-[13px] text-white/45">
            {data.important > 0 && <span className="text-white/75">{data.important} require attention</span>}
            {data.important > 0 && (data.newsletters > 0 || data.receipts > 0) && <span className="text-white/25"> · </span>}
            {data.newsletters > 0 && <span>{data.newsletters} newsletters</span>}
            {data.newsletters > 0 && data.receipts > 0 && <span className="text-white/25"> · </span>}
            {data.receipts > 0 && <span>{data.receipts} receipts</span>}
          </p>
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
  const candidates = useCleanupStore((s) => s.candidates);
  const real = useCleanupStore((s) => s.real);
  const reviewable = useMemo(() => (candidates ?? []).filter((c) => c.risk !== "destructive").reduce((s, c) => s + c.bytes, 0), [candidates]);
  const go = () => { navigate("system"); setTab("storage"); };
  return (
    <div>
      <SectionLabel action="Analyze" onAction={go}>Storage</SectionLabel>
      <button onClick={go} className="block w-full text-left">
        <p className="font-sans text-display-lg font-semibold tabular tracking-tight text-white">{candidates ? formatBytes(reviewable, 0) : "—"}<span className="ml-3 font-sans text-base font-normal text-white/40">{candidates ? "reviewable" : "discovering"}{!real && candidates ? " · demo" : ""}</span></p>
        <div className="mt-4 space-y-2.5">
          {drives.slice(0, 3).map((d) => {
            const used = d.totalBytes - d.freeBytes;
            const pct = d.totalBytes ? (used / d.totalBytes) * 100 : 0;
            return (
              <div key={d.mountPoint} className="grid grid-cols-[44px_1fr_auto] items-center gap-4">
                <span className="font-mono text-[12px] text-white/50">{d.mountPoint}</span>
                <div className="relative h-px bg-white/[0.08]"><div className={cn("absolute inset-y-0 left-0", pct > 88 ? "bg-status-warning" : "bg-white/70")} style={{ width: `${pct}%` }} /></div>
                <span className="font-mono text-[11px] tabular text-white/35">{formatBytes(d.freeBytes, 0)} free</span>
              </div>
            );
          })}
        </div>
      </button>
    </div>
  );
}

/* ---------- Assistant insights ---------- */
const TONE_DOT = { neutral: "bg-white/25", accent: "bg-white/70", attention: "bg-status-attention", warning: "bg-status-warning" } as const;

export function InsightsSurface() {
  const insights = useInsights();
  const dismiss = useInsightPrefsStore((s) => s.dismiss);
  if (insights.length === 0) return null;
  return (
    <div>
      <SectionLabel>NEXUS</SectionLabel>
      <ul className="space-y-3">
        {insights.slice(0, 4).map((ins) => (
          <li key={ins.id} className="group flex items-baseline gap-3 text-[14px]">
            <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", TONE_DOT[ins.tone])} />
            <p className="flex-1 leading-relaxed text-white/60">{ins.text}</p>
            {ins.action && (
              <button onClick={() => void actionRegistry.execute(ins.action!.actionId as ActionId, { args: ins.action!.args ?? {} })} className="shrink-0 text-micro text-white/35 transition-colors hover:text-white">
                {ins.action.label}
              </button>
            )}
            <button onClick={() => dismiss(ins.id)} className="shrink-0 text-white/20 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" aria-label="Dismiss suggestion"><X size={12} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
