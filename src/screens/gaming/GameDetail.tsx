import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Target, type LucideIcon, KeyRound, WifiOff, ShieldOff, Info } from "lucide-react";
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
  "not-configured": { icon: KeyRound, title: "Steam Web API not configured", body: "Add your Steam Web API key and SteamID64 in Integrations to see achievements and playtime.", action: "integrations" },
  "private-profile": { icon: ShieldOff, title: "Profile is private", body: "Set “Game details” to Public in Steam privacy settings to load achievements." },
  "no-achievements": { icon: Info, title: "No achievements", body: "This game does not expose Steam achievements." },
  "network-error": { icon: WifiOff, title: "Steam is unreachable", body: "Achievements will load when the network is available." },
  "api-error": { icon: Info, title: "Steam API error", body: "The Steam Web API returned an unexpected response. NEXUS will retry shortly." },
};

/** Completion ring — thin, monochrome. */
function Ring({ pct, size = 128 }: { pct: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (pct / 100) * c }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[34px] font-semibold leading-none tabular text-white">{pct}<span className="text-base text-white/40">%</span></span>
      </div>
    </div>
  );
}

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

  if (loading && !game) return <div className="flex h-full items-center justify-center text-micro text-white/30">Loading</div>;
  if (error || !game) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <p className="font-display text-display-sm uppercase tracking-wide2 text-white/70">{error ? "Steam unavailable" : "Game not found"}</p>
        <Button variant="outline" size="sm" onClick={() => selectGame(null)}><ArrowLeft size={14} /> Library</Button>
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
    if (trackedFor?.achievementId === id) { untrack(id); notify.neutral("Stopped tracking", name); }
    else { track({ gameId, gameTitle: game.title, achievementId: id, name }); notify.success("Tracking", `${name} · ${game.title}`); }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="relative h-[min(64vh,680px)] min-h-[460px]">
        <HeroArt game={game} />
        <div className="relative mx-auto flex h-full max-w-[1560px] flex-col justify-between px-12 py-6 2xl:px-16">
          <Button variant="ghost" size="sm" className="-ml-3 w-fit text-white/50" onClick={() => selectGame(null)}><ArrowLeft size={14} /> Library</Button>
          <div className="max-w-4xl pb-6">
            <p className="text-micro tracking-cinematic text-white/40">
              {[game.developer, game.publisher].filter(Boolean).join(" · ") || (game.genres.length ? game.genres.slice(0, 3).join(" · ") : "Steam")}
              {!game.installed && <span className="ml-3 text-status-attention/80">Not installed</span>}
            </p>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }} className="mt-4 font-display text-display-xl font-semibold uppercase tracking-wide text-white">
              {game.title}
            </motion.h1>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[12.5px] tabular text-white/50">
              <span><span className="text-white/90">{game.playtimeMinutes > 0 ? formatPlaytime(game.playtimeMinutes) : "—"}</span> played</span>
              <span><span className="text-white/90">{game.lastPlayed ? formatRelativeTime(game.lastPlayed) : "—"}</span> last played</span>
              {game.installSizeBytes != null && <span><span className="text-white/90">{formatBytes(game.installSizeBytes, 1)}</span> on disk</span>}
              {hasData && <span><span className="text-white/90">{ach.unlocked} / {ach.total}</span> achievements</span>}
            </div>
            <div className="mt-8 flex items-center gap-3">
              <Button variant="primary" size="lg" disabled={!game.installed} onClick={() => void actionRegistry.execute("launch-game", { args: { gameId } })}>
                <Play size={16} fill="currentColor" /> {game.installed ? "Play" : "Not installed"}
              </Button>
              {trackedFor && (
                <span className="flex items-center gap-2 text-[13px] text-white/60"><Target size={13} className="text-white/40" /> Tracking <span className="text-white/90">{trackedFor.name}</span></span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1560px] px-12 pb-20 pt-10 2xl:px-16">
        {statusMeta && (
          <div className="mb-12 flex items-start gap-5 border-l border-white/15 pl-5">
            <statusMeta.icon size={16} className="mt-1 shrink-0 text-white/45" />
            <div className="flex-1">
              <p className="text-[14px] text-white/85">{statusMeta.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-white/45">{statusMeta.body}</p>
            </div>
            {statusMeta.action === "integrations" && <Button size="sm" variant="outline" onClick={() => { navigate("settings"); setSection("integrations"); }}>Configure</Button>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-20 gap-y-14 lg:grid-cols-[380px_1fr]">
          <div className="space-y-14">
            {hasData && (
              <div>
                <p className="label mb-6">Completion</p>
                <div className="flex items-center gap-8">
                  <Ring pct={pct} />
                  <div>
                    <p className="font-display text-display-sm font-semibold tabular text-white">{ach.unlocked} <span className="text-white/35">/ {ach.total}</span></p>
                    <p className="mt-1 text-[13px] text-white/40">{remaining === 0 ? "Fully completed" : `${remaining} remaining`}</p>
                  </div>
                </div>
              </div>
            )}

            {closest.length > 0 && (
              <div>
                <p className="label mb-2">Closest</p>
                <p className="mb-3 text-[12px] leading-relaxed text-white/35">{trackedFor ? "Your tracked goal, then " : "Steam doesn't expose per-achievement progress; these are "}the locked achievements most players unlock.</p>
                <div className="divide-y divide-white/[0.05]">
                  {closest.map((c) => <AchievementRow key={c.achievement.id} achievement={c.achievement} compact tracked={c.reason === "tracked"} />)}
                </div>
              </div>
            )}

            {game.summary && (
              <div>
                <p className="label mb-3">About</p>
                <p className="text-[14px] leading-relaxed text-white/55" data-selectable="true">{game.summary}</p>
              </div>
            )}
          </div>

          <div className="space-y-14">
            {recent.length > 0 && (
              <div>
                <p className="label mb-3">Recent unlocks</p>
                <div className="divide-y divide-white/[0.05]">{recent.map((a) => <AchievementRow key={a.id} achievement={a} />)}</div>
              </div>
            )}

            {all.length > 0 && (
              <div>
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="label">Achievements <span className="ml-2 normal-case tracking-normal text-white/20">click a locked one to track it</span></p>
                  <div className="flex gap-5 text-[12.5px]">
                    {(["all", "unlocked", "locked"] as Tab[]).map((t) => (
                      <button key={t} onClick={() => setTab(t)} className={cn("capitalize transition-colors", tab === t ? "text-white" : "text-white/35 hover:text-white/70")}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-12 xl:grid-cols-2">
                  {list.map((a) => (
                    <button key={a.id} onClick={() => !a.unlocked && toggleTrack(a.id, a.name)} disabled={a.unlocked} className={cn("border-b border-white/[0.05] text-left", !a.unlocked && "cursor-pointer")}>
                      <AchievementRow achievement={a} tracked={trackedFor?.achievementId === a.id} />
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
