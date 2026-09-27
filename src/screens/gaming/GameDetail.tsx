import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Download, Play, Target, Trophy, KeyRound, WifiOff, ShieldOff, Info, type LucideIcon } from "lucide-react";
import { AchievementRow } from "./AchievementRow";
import { HeroArt } from "./HeroArt";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useNavigationStore } from "@/state/navigationStore";
import { useGamePrefsStore } from "@/state/gamePrefsStore";
import { notify } from "@/state/toastStore";
import { actionRegistry } from "@/core/actions/registry";
import { completionPercent, type AchievementSourceStatus, type GameDetails } from "@/core/types";
import { closestAchievements, recentUnlocks } from "@/core/gaming/completion";
import { formatBytes, formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "all" | "unlocked" | "locked";

const STATUS_META: Record<Exclude<AchievementSourceStatus, "ok" | "demo">, { icon: LucideIcon; title: string; body: string; action?: "integrations" }> = {
  "not-configured": { icon: KeyRound, title: "Steam Web API not configured", body: "Add your Steam Web API key and SteamID64 in Integrations to see your achievements and playtime.", action: "integrations" },
  "private-profile": { icon: ShieldOff, title: "Profile is private", body: "Your Steam profile's game details are private. Set “Game details” to Public in Steam privacy settings to load achievements." },
  "no-achievements": { icon: Info, title: "No achievements", body: "This game does not expose Steam achievements." },
  "network-error": { icon: WifiOff, title: "Steam is unreachable", body: "NEXUS could not reach the Steam Web API. Achievements will load when the network is available." },
  "api-error": { icon: Info, title: "Steam API error", body: "The Steam Web API returned an unexpected response. NEXUS will retry shortly." },
};

export function GameDetail({ gameId }: { gameId: string }) {
  const selectGame = useNavigationStore((s) => s.selectGame);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const { data: game, loading, error } = useAsync<GameDetails | null>(() => getProviders().steam.getGameDetails(gameId), [gameId]);
  const [tab, setTab] = useState<Tab>("all");
  const trackedFor = useGamePrefsStore((s) => s.trackedFor(gameId));
  const track = useGamePrefsStore((s) => s.track);
  const untrack = useGamePrefsStore((s) => s.untrack);

  const closest = useMemo(() => (game ? closestAchievements(game, trackedFor?.achievementId ?? null) : []), [game, trackedFor]);

  if (loading && !game) return <div className="flex h-full items-center justify-center text-white/30">Loading…</div>;
  if (error || !game) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-xl tracking-cinematic text-white/70">{error ? "STEAM UNAVAILABLE" : "GAME NOT FOUND"}</p>
        <Button variant="outline" onClick={() => selectGame(null)}><ArrowLeft size={14} /> Library</Button>
      </div>
    );
  }

  const ach = game.achievements;
  const status = ach.status ?? "ok";
  const hasData = ach.total > 0 && (status === "ok" || status === "demo");
  const pct = completionPercent(ach);
  const all = ach.achievements;
  const recent = recentUnlocks(game);
  const list = tab === "all" ? all : tab === "unlocked" ? all.filter((a) => a.unlocked) : all.filter((a) => !a.unlocked);
  const remaining = ach.total - ach.unlocked;
  const statusMeta = status !== "ok" && status !== "demo" ? STATUS_META[status] : null;

  const toggleTrack = (id: string, name: string) => {
    if (trackedFor?.achievementId === id) {
      untrack(id);
      notify.neutral("Stopped tracking", name);
    } else {
      track({ gameId, gameTitle: game.title, achievementId: id, name });
      notify.success("Tracking achievement", `${name} · ${game.title}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="relative" style={{ height: 400 }}>
        <HeroArt game={game} />
        <div className="absolute inset-0 bg-gradient-to-t from-void-950 via-void-950/50 to-void-950/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-void-950/70 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-[1500px] flex-col justify-between px-10 py-6 2xl:px-14">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => selectGame(null)}><ArrowLeft size={15} /> Library</Button>
          <div>
            <div className="flex flex-wrap gap-2">
              {game.genres.map((g) => <span key={g} className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-white/60">{g}</span>)}
              {!game.installed && <span className="rounded-full border border-status-attention/30 bg-status-attention/10 px-2.5 py-0.5 text-[11px] text-status-attention">Not installed</span>}
            </div>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-3 font-display text-6xl font-bold tracking-wide text-white drop-shadow-lg">
              {game.title}
            </motion.h1>
            <p className="mt-2 text-sm text-white/50">
              {[game.developer, game.publisher].filter(Boolean).join(" · ")}{game.steamAppId ? `${game.developer ? " · " : ""}Steam ${game.steamAppId}` : ""}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" disabled={!game.installed} onClick={() => void actionRegistry.execute("launch-game", { args: { gameId } })}>
                <Play size={18} fill="currentColor" /> {game.installed ? "Play" : "Not installed"}
              </Button>
              <Stat icon={<Clock size={14} />} label="Playtime" value={game.playtimeMinutes > 0 ? formatPlaytime(game.playtimeMinutes) : status === "not-configured" ? "Needs API" : "—"} />
              <Stat icon={<Play size={14} />} label="Last played" value={game.lastPlayed ? formatRelativeTime(game.lastPlayed) : "—"} />
              <Stat icon={<Download size={14} />} label={game.installSizeBytes != null ? "Size" : "Status"} value={game.installSizeBytes != null ? formatBytes(game.installSizeBytes, 1) : "Not installed"} />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[1500px] px-10 pb-14 pt-8 2xl:px-14">
        {statusMeta && (
          <div className="mb-8 flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <statusMeta.icon size={20} className="mt-0.5 shrink-0 text-accent/70" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white/85">{statusMeta.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/45">{statusMeta.body}</p>
            </div>
            {statusMeta.action === "integrations" && (
              <Button size="sm" variant="outline" onClick={() => { navigate("settings"); setSection("integrations"); }}>Configure</Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[360px_1fr]">
          <div className="space-y-10">
            {hasData && (
              <div>
                <p className="text-[10px] uppercase tracking-cinematic text-white/30">Completion</p>
                <div className="mt-3 flex items-end gap-4">
                  <span className="font-display text-6xl font-bold leading-none text-white">{pct}<span className="text-2xl text-white/40">%</span></span>
                  <div className="pb-1">
                    <p className="flex items-center gap-2 text-sm text-white/80"><Trophy size={14} className="text-ember" /> {ach.unlocked} / {ach.total}</p>
                    <p className="text-xs text-white/40">{remaining === 0 ? "Fully completed" : `${remaining} remaining`}</p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full bg-gradient-to-r from-ember/70 to-ember" style={{ boxShadow: "0 0 12px rgba(230,161,94,0.6)" }} />
                </div>
              </div>
            )}

            {closest.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-cinematic text-accent/70"><Target size={11} /> Closest achievements</p>
                <p className="mt-1 text-xs text-white/35">
                  {trackedFor ? "Your tracked goal first, then " : "Steam doesn't expose per-achievement progress, so these are "}the locked achievements most players unlock.
                </p>
                <div className="-mx-3 mt-3">
                  {closest.map((c) => (
                    <div key={c.achievement.id} className="relative">
                      <AchievementRow achievement={c.achievement} compact />
                      <span className={cn("absolute right-3 top-1 text-[9px] uppercase tracking-wide2", c.reason === "tracked" ? "text-accent" : "text-white/25")}>
                        {c.reason === "tracked" ? "tracked" : "common"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {game.summary && (
              <div>
                <p className="text-[10px] uppercase tracking-cinematic text-white/30">About</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55" data-selectable="true">{game.summary}</p>
              </div>
            )}
          </div>

          <div className="space-y-10">
            {recent.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-cinematic text-white/30">Recent unlocks</p>
                <div className="-mx-3 mt-3">{recent.map((a) => <AchievementRow key={a.id} achievement={a} />)}</div>
              </div>
            )}

            {all.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-cinematic text-white/30">Achievements <span className="ml-1 text-white/20">click to track</span></p>
                  <div className="flex gap-1 text-xs">
                    {(["all", "unlocked", "locked"] as Tab[]).map((t) => (
                      <button key={t} onClick={() => setTab(t)} className={cn("rounded-full px-3 py-1 capitalize transition-colors", tab === t ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/80")}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="-mx-3 mt-3 grid grid-cols-1 xl:grid-cols-2">
                  {list.map((a) => (
                    <button key={a.id} onClick={() => !a.unlocked && toggleTrack(a.id, a.name)} className={cn("text-left", !a.unlocked && "cursor-pointer", trackedFor?.achievementId === a.id && "rounded-xl ring-1 ring-accent/40")} disabled={a.unlocked}>
                      <AchievementRow achievement={a} />
                    </button>
                  ))}
                </div>
                {list.length === 0 && <p className="py-8 text-center text-sm text-white/30">Nothing here.</p>}
              </div>
            )}
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
