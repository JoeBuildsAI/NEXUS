import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Download, Play, Target, Trophy } from "lucide-react";
import { AchievementRow } from "./AchievementRow";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useNavigationStore } from "@/state/navigationStore";
import { actionRegistry } from "@/core/actions/registry";
import { completionPercent, type GameDetails } from "@/core/types";
import { formatBytes, formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "all" | "unlocked" | "locked";

export function GameDetail({ gameId }: { gameId: string }) {
  const selectGame = useNavigationStore((s) => s.selectGame);
  const { data: game, loading, error } = useAsync<GameDetails | null>(() => getProviders().steam.getGameDetails(gameId), [gameId]);
  const [tab, setTab] = useState<Tab>("all");

  const closest = useMemo(() => {
    if (!game) return [];
    return [...game.achievements.achievements].filter((a) => !a.unlocked && a.globalPercent != null).sort((a, b) => (b.globalPercent ?? 0) - (a.globalPercent ?? 0)).slice(0, 3);
  }, [game]);

  if (loading && !game) return <div className="flex h-full items-center justify-center text-white/30">Loading…</div>;
  if (error || !game) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-xl tracking-cinematic text-white/70">{error ? "STEAM OFFLINE" : "GAME NOT FOUND"}</p>
        <Button variant="outline" onClick={() => selectGame(null)}><ArrowLeft size={14} /> Library</Button>
      </div>
    );
  }

  const pct = completionPercent(game.achievements);
  const all = game.achievements.achievements;
  const recent = [...all].filter((a) => a.unlocked && a.unlockedAt).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)).slice(0, 5);
  const list = tab === "all" ? all : tab === "unlocked" ? all.filter((a) => a.unlocked) : all.filter((a) => !a.unlocked);
  const remaining = game.achievements.total - game.achievements.unlocked;

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="relative" style={{ height: 400 }}>
        <motion.div initial={{ scale: 1.04, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${game.coverColor} 0%, ${game.heroColor} 55%, #05070a 100%)` }}>
          <div className="absolute inset-0 bg-grid opacity-10" />
          <span className="absolute -right-4 -top-16 select-none font-display text-[420px] font-black leading-none text-white/[0.035]">{game.title.charAt(0)}</span>
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-void-950 via-void-950/50 to-void-950/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-void-950/70 to-transparent" />

        <div className="relative mx-auto flex h-full max-w-[1500px] flex-col justify-between px-10 py-6 2xl:px-14">
          <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={() => selectGame(null)}>
            <ArrowLeft size={15} /> Library
          </Button>
          <div>
            <div className="flex flex-wrap gap-2">
              {game.genres.map((g) => <span key={g} className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-white/60">{g}</span>)}
              {!game.installed && <span className="rounded-full border border-status-attention/30 bg-status-attention/10 px-2.5 py-0.5 text-[11px] text-status-attention">Not installed</span>}
            </div>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-3 font-display text-6xl font-bold tracking-wide text-white">
              {game.title}
            </motion.h1>
            <p className="mt-2 text-sm text-white/50">{game.developer} · {game.publisher}{game.steamAppId ? ` · Steam ${game.steamAppId}` : ""}</p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" onClick={() => void actionRegistry.execute("launch-game", { args: { gameId } })}>
                <Play size={18} fill="currentColor" /> {game.installed ? "Play" : "Install & Play"}
              </Button>
              <Stat icon={<Clock size={14} />} label="Playtime" value={formatPlaytime(game.playtimeMinutes)} />
              <Stat icon={<Play size={14} />} label="Last played" value={game.lastPlayed ? formatRelativeTime(game.lastPlayed) : "Never"} />
              <Stat icon={<Download size={14} />} label={game.installSizeBytes != null ? "Size" : "Status"} value={game.installSizeBytes != null ? formatBytes(game.installSizeBytes, 1) : "Not installed"} />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[1500px] px-10 pb-14 pt-8 2xl:px-14">
        <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[360px_1fr]">
          {/* Left: progress + closest */}
          <div className="space-y-10">
            <div>
              <p className="text-[10px] uppercase tracking-cinematic text-white/30">Completion</p>
              <div className="mt-3 flex items-end gap-4">
                <span className="font-display text-6xl font-bold leading-none text-white">{pct}<span className="text-2xl text-white/40">%</span></span>
                <div className="pb-1">
                  <p className="flex items-center gap-2 text-sm text-white/80"><Trophy size={14} className="text-ember" /> {game.achievements.unlocked} / {game.achievements.total}</p>
                  <p className="text-xs text-white/40">{remaining === 0 ? "Fully completed" : `${remaining} remaining`}</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full bg-gradient-to-r from-ember/70 to-ember" style={{ boxShadow: "0 0 12px rgba(230,161,94,0.6)" }} />
              </div>
            </div>

            {closest.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-cinematic text-accent/70"><Target size={11} /> Closest achievements</p>
                <p className="mt-1 text-xs text-white/35">Locked achievements most players have — likely your next unlocks.</p>
                <div className="mt-3 -mx-3">
                  {closest.map((a) => <AchievementRow key={a.id} achievement={a} compact />)}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-cinematic text-white/30">About</p>
              <p className="mt-2 text-sm leading-relaxed text-white/55" data-selectable="true">{game.summary}</p>
            </div>
          </div>

          {/* Right: recent + all */}
          <div className="space-y-10">
            {recent.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-cinematic text-white/30">Recent unlocks</p>
                <div className="mt-3 -mx-3">{recent.map((a) => <AchievementRow key={a.id} achievement={a} />)}</div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-cinematic text-white/30">Achievements</p>
                <div className="flex gap-1 text-xs">
                  {(["all", "unlocked", "locked"] as Tab[]).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={cn("rounded-full px-3 py-1 capitalize transition-colors", tab === t ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/80")}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-3 -mx-3 grid grid-cols-1 xl:grid-cols-2">
                {list.map((a) => <AchievementRow key={a.id} achievement={a} />)}
              </div>
              {list.length === 0 && <p className="py-8 text-center text-sm text-white/30">Nothing here.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-void-950/40 px-4 py-2.5 backdrop-blur">
      <span className="text-accent/60">{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-wide2 text-white/35">{label}</p>
        <p className="text-sm font-medium text-white/85">{value}</p>
      </div>
    </div>
  );
}
