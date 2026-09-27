import { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Play, Trophy, Unplug } from "lucide-react";
import { GameCard } from "./GameCard";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useNavigationStore } from "@/state/navigationStore";
import { useDevStore } from "@/state/devStore";
import { actionRegistry } from "@/core/actions/registry";
import { completionPercent, type Game, type GameDetails } from "@/core/types";
import { isOffline } from "@/core/errors";
import { formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Row {
  title: string;
  games: GameDetails[];
}

export function GameLibrary() {
  const selectGame = useNavigationStore((s) => s.selectGame);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const steamConnected = useDevStore((s) => s.steamConnected);
  const { data, loading, error } = useAsync<GameDetails[]>(async () => {
    const { steam } = getProviders();
    const games = await steam.getGames();
    const details = await Promise.all(games.map((g) => steam.getGameDetails(g.id)));
    return details.filter((d): d is GameDetails => d != null);
  }, [steamConnected]);

  const games = useMemo(() => data ?? [], [data]);
  const featured = useMemo(() => [...games].filter((g) => g.lastPlayed && g.installed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0], [games]);

  const rows = useMemo<Row[]>(() => {
    const byRecent = [...games].filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    const pct = (g: GameDetails) => completionPercent(g.achievements);
    return [
      { title: "Recently played", games: byRecent },
      { title: "Installed", games: games.filter((g) => g.installed) },
      { title: "Nearly complete", games: games.filter((g) => pct(g) >= 70 && pct(g) < 100).sort((a, b) => pct(b) - pct(a)) },
      { title: "Not installed", games: games.filter((g) => !g.installed) },
    ];
  }, [games]);

  const totals = useMemo(() => {
    const unlocked = games.reduce((s, g) => s + g.achievements.unlocked, 0);
    const total = games.reduce((s, g) => s + g.achievements.total, 0);
    const hours = Math.round(games.reduce((s, g) => s + g.playtimeMinutes, 0) / 60);
    const completed = games.filter((g) => g.achievements.total > 0 && g.achievements.unlocked === g.achievements.total).length;
    return { unlocked, total, hours, completed };
  }, [games]);

  if (error && isOffline(error)) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <div className="max-w-md text-center">
          <Unplug size={28} className="mx-auto text-white/30" />
          <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">STEAM OFFLINE</p>
          <p className="mt-3 text-sm leading-relaxed text-white/45">NEXUS cannot reach a game library right now. Connect Steam in Integrations when this machine is ready.</p>
          <Button variant="outline" className="mt-6" onClick={() => { navigate("settings"); setSection("integrations"); }}>Open Integrations</Button>
        </div>
      </div>
    );
  }

  if (loading && !data) return <LibrarySkeleton />;

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <p className="font-display text-2xl tracking-cinematic text-white/70">NO GAMES</p>
          <p className="mt-2 text-sm text-white/40">Your library is empty.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1700px] px-10 pb-14 pt-8 2xl:px-14">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-cinematic text-accent/70">Library</p>
            <h1 className="mt-1 font-display text-[2rem] font-semibold leading-none tracking-wide2 text-white/95">Gaming</h1>
          </div>
          <div className="flex gap-10 font-mono text-xs text-white/40">
            <Stat n={games.length} label="games" />
            <Stat n={totals.hours} label="hours" />
            <Stat n={`${totals.unlocked}/${totals.total}`} label="achievements" />
            <Stat n={totals.completed} label="completed" accent />
          </div>
        </div>

        {/* Featured */}
        {featured && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="group relative mt-8 overflow-hidden rounded-3xl" style={{ height: 340 }}>
            <div className="absolute inset-0 transition-transform duration-[1200ms] group-hover:scale-[1.03]" style={{ background: `linear-gradient(110deg, ${featured.coverColor} 0%, ${featured.heroColor} 55%, #05070a 100%)` }}>
              <div className="absolute inset-0 bg-grid opacity-10" />
              <span className="absolute -right-6 bottom-[-40px] select-none font-display text-[260px] font-black leading-none text-white/[0.04]">{featured.title.charAt(0)}</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-void-950/90 via-void-950/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-void-950/80 to-transparent" />

            <div className="relative flex h-full flex-col justify-between p-8">
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-cinematic text-white/50"><Clock size={11} /> Continue playing · {featured.lastPlayed ? formatRelativeTime(featured.lastPlayed) : ""}</span>
              <div>
                <h2 className="font-display text-5xl font-bold tracking-wide text-white">{featured.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-white/65">
                  <span>{formatPlaytime(featured.playtimeMinutes)} played</span>
                  <span className="flex items-center gap-1.5"><Trophy size={14} className="text-ember" /> {featured.achievements.unlocked} / {featured.achievements.total}</span>
                  <span className="font-mono text-accent">{completionPercent(featured.achievements)}% complete</span>
                  {featured.genres.slice(0, 2).map((g) => <span key={g} className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/55">{g}</span>)}
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <Button variant="primary" size="lg" onClick={() => void actionRegistry.execute("launch-game", { args: { gameId: featured.id } })}>
                    <Play size={18} fill="currentColor" /> Play
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => selectGame(featured.id)}>Details</Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Rows */}
        <div className="mt-12 space-y-12">
          {rows.filter((r) => r.games.length > 0).map((row) => (
            <GameRow key={row.title} title={row.title} games={row.games} onSelect={(g) => selectGame(g.id)} />
          ))}

          {/* Completion */}
          <section>
            <p className="mb-4 text-[10px] uppercase tracking-cinematic text-white/30">Completion</p>
            <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-3">
              <CompletionColumn title="Completed" games={games.filter((g) => completionPercent(g.achievements) === 100)} onSelect={(g) => selectGame(g.id)} tone="nominal" />
              <CompletionColumn title="Near completion" games={games.filter((g) => { const p = completionPercent(g.achievements); return p >= 70 && p < 100; })} onSelect={(g) => selectGame(g.id)} tone="accent" />
              <CompletionColumn title="In progress" games={games.filter((g) => completionPercent(g.achievements) < 70)} onSelect={(g) => selectGame(g.id)} tone="neutral" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, accent }: { n: number | string; label: string; accent?: boolean }) {
  return (
    <span><span className={cn("text-base", accent ? "text-accent" : "text-white/85")}>{n}</span> {label}</span>
  );
}

function GameRow({ title, games, onSelect }: { title: string; games: Game[]; onSelect: (g: Game) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 640, behavior: "smooth" });
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-cinematic text-white/30">{title} <span className="ml-2 text-white/20">{games.length}</span></p>
        <div className="flex gap-1">
          <button onClick={() => scroll(-1)} className="rounded-md p-1 text-white/30 hover:bg-white/[0.05] hover:text-white"><ChevronLeft size={16} /></button>
          <button onClick={() => scroll(1)} className="rounded-md p-1 text-white/30 hover:bg-white/[0.05] hover:text-white"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div ref={ref} className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {games.map((g) => (
          <div key={g.id} className="w-[168px] shrink-0 2xl:w-[188px]">
            <GameCard game={g} completion={completionPercent((g as GameDetails).achievements ?? { unlocked: 0, total: 0 })} onClick={() => onSelect(g)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function CompletionColumn({ title, games, onSelect, tone }: { title: string; games: GameDetails[]; onSelect: (g: Game) => void; tone: "nominal" | "accent" | "neutral" }) {
  const color = tone === "nominal" ? "bg-status-nominal" : tone === "accent" ? "bg-accent" : "bg-white/40";
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-xs text-white/50"><span className={cn("h-1.5 w-1.5 rounded-full", color)} /> {title} <span className="text-white/25">{games.length}</span></p>
      {games.length === 0 ? (
        <p className="text-xs text-white/25">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {games.map((g) => {
            const pct = completionPercent(g.achievements);
            return (
              <li key={g.id}>
                <button onClick={() => onSelect(g)} className="flex w-full items-center gap-3 py-2.5 text-left hover:text-white">
                  <span className="h-8 w-6 shrink-0 rounded-sm" style={{ background: `linear-gradient(160deg, ${g.coverColor}, ${g.heroColor})` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white/80">{g.title}</span>
                    <span className="block text-[11px] text-white/35">{g.achievements.unlocked} / {g.achievements.total} · {g.achievements.total - g.achievements.unlocked} remaining</span>
                  </span>
                  <span className="font-mono text-xs text-white/60">{pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="mx-auto max-w-[1700px] px-10 pt-8">
      <div className="h-8 w-40 animate-pulse rounded bg-white/[0.04]" />
      <div className="mt-8 h-[340px] animate-pulse rounded-3xl bg-white/[0.03]" />
      <div className="mt-12 flex gap-4">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="aspect-[3/4] w-[168px] animate-pulse rounded-xl bg-white/[0.03]" />)}</div>
    </div>
  );
}
