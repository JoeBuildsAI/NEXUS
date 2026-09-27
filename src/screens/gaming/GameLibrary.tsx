import { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Play, Target, Trophy, Unplug } from "lucide-react";
import { GameCard } from "./GameCard";
import { HeroArt } from "./HeroArt";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useNavigationStore } from "@/state/navigationStore";
import { useDevStore } from "@/state/devStore";
import { useGamePrefsStore } from "@/state/gamePrefsStore";
import { actionRegistry } from "@/core/actions/registry";
import { completionPercent, type Game, type GameDetails } from "@/core/types";
import { bucketFor, libraryTotals } from "@/core/gaming/completion";
import { isOffline } from "@/core/errors";
import { formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { Badge, Button } from "@/components/ui";
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
  const tracked = useGamePrefsStore((s) => s.tracked);
  const { data, loading, error } = useAsync<{ games: GameDetails[]; mode: "real" | "demo" }>(async () => {
    const { steam } = getProviders();
    const games = await steam.getGames();
    const details = await Promise.all(games.map((g) => steam.getGameDetails(g.id)));
    const mode = "mode" in steam && typeof (steam as { mode?: () => Promise<"real" | "demo"> }).mode === "function" ? await (steam as { mode: () => Promise<"real" | "demo"> }).mode() : "demo";
    return { games: details.filter((d): d is GameDetails => d != null), mode };
  }, [steamConnected]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const featured = useMemo(() => [...games].filter((g) => g.installed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0], [games]);

  const rows = useMemo<Row[]>(() => {
    const byRecent = [...games].filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    return [
      { title: "Recently played", games: byRecent },
      { title: "Installed", games: games.filter((g) => g.installed) },
      { title: "Nearly complete", games: games.filter((g) => bucketFor(g) === "near").sort((a, b) => completionPercent(b.achievements) - completionPercent(a.achievements)) },
      { title: "Not installed", games: games.filter((g) => !g.installed) },
    ];
  }, [games]);

  const totals = useMemo(() => libraryTotals(games), [games]);
  const trackedTop = tracked[0];

  if (error && isOffline(error)) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <div className="max-w-md text-center">
          <Unplug size={28} className="mx-auto text-white/30" />
          <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">STEAM NOT DETECTED</p>
          <p className="mt-3 text-sm leading-relaxed text-white/45">NEXUS looks for Steam through the Windows registry and its library folders. Install or sign in to Steam once, then re-check in Integrations.</p>
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
          <p className="font-display text-2xl tracking-cinematic text-white/70">NO INSTALLED GAMES</p>
          <p className="mt-2 text-sm text-white/40">Steam was detected but no installed games were found in its libraries.</p>
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
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-cinematic text-accent/70">
              Library {data?.mode === "demo" && <Badge tone="accent">Demo library</Badge>}
            </p>
            <h1 className="mt-1 font-display text-[2rem] font-semibold leading-none tracking-wide2 text-white/95">Gaming</h1>
          </div>
          <div className="flex flex-wrap gap-8 font-mono text-xs text-white/40">
            <Stat n={totals.games} label="games" />
            <Stat n={totals.installed} label="installed" />
            {totals.hours > 0 && <Stat n={totals.hours} label="hours" />}
            {totals.total > 0 && <Stat n={`${totals.unlocked}/${totals.total}`} label="achievements" />}
            {totals.total > 0 && <Stat n={totals.completed} label="completed" accent />}
          </div>
        </div>

        {/* Tracked achievement */}
        {trackedTop && (
          <button
            onClick={() => selectGame(trackedTop.gameId)}
            className="mt-6 flex w-full items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3 text-left transition-colors hover:border-accent/40"
          >
            <Target size={16} className="text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide2 text-accent/70">Tracking</p>
              <p className="truncate text-sm text-white/85">{trackedTop.name} <span className="text-white/40">· {trackedTop.gameTitle}</span></p>
            </div>
            <ChevronRight size={14} className="text-white/30" />
          </button>
        )}

        {/* Featured */}
        {featured && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="group relative mt-8 overflow-hidden rounded-3xl" style={{ height: 340 }}>
            <HeroArt game={featured} />
            <div className="absolute inset-0 bg-gradient-to-r from-void-950/90 via-void-950/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-void-950/80 to-transparent" />
            <div className="relative flex h-full flex-col justify-between p-8">
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-cinematic text-white/50">
                <Clock size={11} /> {featured.lastPlayed ? `Continue playing · ${formatRelativeTime(featured.lastPlayed)}` : "Ready to play"}
              </span>
              <div>
                <h2 className="font-display text-5xl font-bold tracking-wide text-white drop-shadow-lg">{featured.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-white/65">
                  {featured.playtimeMinutes > 0 && <span>{formatPlaytime(featured.playtimeMinutes)} played</span>}
                  {featured.achievements.total > 0 && (
                    <>
                      <span className="flex items-center gap-1.5"><Trophy size={14} className="text-ember" /> {featured.achievements.unlocked} / {featured.achievements.total}</span>
                      <span className="font-mono text-accent">{completionPercent(featured.achievements)}% complete</span>
                    </>
                  )}
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

          {totals.total > 0 && (
            <section>
              <p className="mb-4 text-[10px] uppercase tracking-cinematic text-white/30">Completion</p>
              <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-3">
                <CompletionColumn title="Completed" games={games.filter((g) => bucketFor(g) === "completed")} onSelect={(g) => selectGame(g.id)} tone="nominal" />
                <CompletionColumn title="Near completion" games={games.filter((g) => bucketFor(g) === "near")} onSelect={(g) => selectGame(g.id)} tone="accent" />
                <CompletionColumn title="In progress" games={games.filter((g) => ["in-progress", "not-started"].includes(bucketFor(g)))} onSelect={(g) => selectGame(g.id)} tone="neutral" />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, accent }: { n: number | string; label: string; accent?: boolean }) {
  return <span><span className={cn("text-base", accent ? "text-accent" : "text-white/85")}>{n}</span> {label}</span>;
}

function GameRow({ title, games, onSelect }: { title: string; games: GameDetails[]; onSelect: (g: Game) => void }) {
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
            <GameCard game={g} completion={g.achievements.total ? completionPercent(g.achievements) : undefined} onClick={() => onSelect(g)} />
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
                  <span className="h-8 w-6 shrink-0 overflow-hidden rounded-sm" style={{ background: `linear-gradient(160deg, ${g.coverColor}, ${g.heroColor})` }}>
                    {g.coverUrl && <img src={g.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </span>
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
