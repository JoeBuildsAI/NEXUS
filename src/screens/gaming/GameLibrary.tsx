import { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play, Target } from "lucide-react";
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
import { Button, ContextMenu } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { gameContextItems } from "./gameContextItems";
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
    const withMode = steam as { mode?: () => Promise<"real" | "demo"> };
    const mode = typeof withMode.mode === "function" ? await withMode.mode() : "demo";
    return { games: details.filter((d): d is GameDetails => d != null), mode };
  }, [steamConnected]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const featured = useMemo(() => [...games].filter((g) => g.installed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0], [games]);
  const rows = useMemo<Row[]>(() => {
    const byRecent = [...games].filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    return [
      { title: "Recently played", games: byRecent },
      { title: "Installed", games: games.filter((g) => g.installed) },
      { title: "Near completion", games: games.filter((g) => bucketFor(g) === "near").sort((a, b) => completionPercent(b.achievements) - completionPercent(a.achievements)) },
      { title: "Not installed", games: games.filter((g) => !g.installed) },
    ];
  }, [games]);
  const totals = useMemo(() => libraryTotals(games), [games]);
  const trackedTop = tracked[0];

  if (error && isOffline(error)) {
    return (
      <EmptyState eyebrow="Steam" title="Not connected" body="NEXUS will detect Steam automatically when available." action={<Button variant="outline" size="sm" onClick={() => { navigate("settings"); setSection("integrations"); }}>Configure</Button>} />
    );
  }
  if (loading && !data) return <LibrarySkeleton />;
  if (games.length === 0) return <EmptyState eyebrow="Steam" title="No installed games" body="Steam was detected but its libraries contain no installed games." />;

  return (
    <div className="h-full overflow-y-auto">
      {/* Featured — artwork owns the top of the screen */}
      {featured && (
        <ContextMenu items={gameContextItems(featured, { select: selectGame })}>
          <div className="relative h-[min(62vh,640px)] min-h-[440px]">
            <HeroArt game={featured} />
            <div className="relative mx-auto flex h-full max-w-[1880px] flex-col justify-end px-12 pb-12 2xl:px-16">
              <div className="flex items-end justify-between gap-10">
                <div className="max-w-3xl">
                  <p className="text-micro tracking-cinematic text-white/40">{data?.mode === "demo" ? "Demo library · " : ""}{featured.lastPlayed ? `Continue · ${formatRelativeTime(featured.lastPlayed)}` : "Ready"}</p>
                  <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className={cn("mt-4 font-display font-semibold uppercase tracking-wide text-white", featured.title.length > 14 ? "text-display-lg" : "text-display-xl")}>
                    {featured.title}
                  </motion.h1>
                  <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[12.5px] tabular text-white/55">
                    {featured.achievements.total > 0 && <span><span className="text-white/90">{featured.achievements.unlocked} / {featured.achievements.total}</span> achievements</span>}
                    {featured.achievements.total > 0 && <span><span className="text-white/90">{completionPercent(featured.achievements)}%</span> complete</span>}
                    {featured.playtimeMinutes > 0 && <span><span className="text-white/90">{formatPlaytime(featured.playtimeMinutes)}</span> played</span>}
                  </div>
                  <div className="mt-8 flex items-center gap-3">
                    <Button variant="primary" size="lg" onClick={() => void actionRegistry.execute("launch-game", { args: { gameId: featured.id } })}>
                      <Play size={16} fill="currentColor" /> Continue
                    </Button>
                    <Button variant="ghost" size="lg" onClick={() => selectGame(featured.id)}>Details</Button>
                  </div>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 font-mono text-[12px] tabular text-white/40 lg:flex">
                  <Stat n={totals.installed} label="installed" />
                  {totals.hours > 0 && <Stat n={`${totals.hours}h`} label="played" />}
                  {totals.total > 0 && <Stat n={`${totals.unlocked}/${totals.total}`} label="achievements" />}
                  {totals.total > 0 && <Stat n={totals.completed} label="completed" />}
                </div>
              </div>
            </div>
          </div>
        </ContextMenu>
      )}

      <div className="mx-auto max-w-[1880px] px-12 pb-20 pt-6 2xl:px-16">
        {trackedTop && (
          <button onClick={() => selectGame(trackedTop.gameId)} className="group mb-10 flex items-center gap-4 text-left">
            <Target size={14} className="text-white/40 transition-colors group-hover:text-white" />
            <span className="text-micro text-white/35">Tracking</span>
            <span className="text-[14px] text-white/80 transition-colors group-hover:text-white">{trackedTop.name} <span className="text-white/35">· {trackedTop.gameTitle}</span></span>
          </button>
        )}

        <div className="space-y-14">
          {rows.filter((r) => r.games.length > 0).map((row) => (
            <GameRow key={row.title} title={row.title} games={row.games} onSelect={(g) => selectGame(g.id)} />
          ))}

          {totals.total > 0 && (
            <section>
              <p className="label mb-6">Completion</p>
              <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-3">
                <CompletionColumn title="Completed" games={games.filter((g) => bucketFor(g) === "completed")} onSelect={(g) => selectGame(g.id)} />
                <CompletionColumn title="Near completion" games={games.filter((g) => bucketFor(g) === "near")} onSelect={(g) => selectGame(g.id)} />
                <CompletionColumn title="In progress" games={games.filter((g) => ["in-progress", "not-started"].includes(bucketFor(g)))} onSelect={(g) => selectGame(g.id)} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return <span><span className="text-white/85">{n}</span> {label}</span>;
}

function GameRow({ title, games, onSelect }: { title: string; games: GameDetails[]; onSelect: (g: Game) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 720, behavior: "smooth" });
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="label">{title} <span className="ml-2 text-white/20">{games.length}</span></p>
        <div className="flex gap-1 opacity-0 transition-opacity [section:hover>&]:opacity-100">
          <button onClick={() => scroll(-1)} className="p-1 text-white/30 hover:text-white" aria-label="Scroll left"><ChevronLeft size={16} /></button>
          <button onClick={() => scroll(1)} className="p-1 text-white/30 hover:text-white" aria-label="Scroll right"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div ref={ref} className="-mx-3 flex gap-4 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {games.map((g) => (
          <ContextMenu key={g.id} items={gameContextItems(g, { select: (id) => onSelect({ ...g, id }) })} className="w-[172px] shrink-0 2xl:w-[196px]">
            <GameCard game={g} completion={g.achievements.total ? completionPercent(g.achievements) : undefined} onClick={() => onSelect(g)} />
          </ContextMenu>
        ))}
      </div>
    </section>
  );
}

function CompletionColumn({ title, games, onSelect }: { title: string; games: GameDetails[]; onSelect: (g: Game) => void }) {
  return (
    <div>
      <p className="mb-3 text-[13px] text-white/50">{title} <span className="text-white/25">{games.length}</span></p>
      {games.length === 0 ? (
        <p className="text-xs text-white/25">—</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {games.map((g) => {
            const pct = completionPercent(g.achievements);
            return (
              <li key={g.id}>
                <button onClick={() => onSelect(g)} className="group flex w-full items-center gap-4 py-3 text-left">
                  <span className="h-10 w-7 shrink-0 overflow-hidden rounded-sm bg-[#0b0b0c]" style={{ background: g.coverUrl ? undefined : `linear-gradient(160deg, ${g.coverColor}, #000)` }}>
                    {g.coverUrl && <img src={g.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-white/80 transition-colors group-hover:text-white">{g.title}</span>
                    <span className="block font-mono text-[11px] tabular text-white/35">{g.achievements.unlocked} / {g.achievements.total}</span>
                  </span>
                  <span className={cn("font-mono text-[12px] tabular", pct === 100 ? "text-white" : "text-white/50")}>{pct}%</span>
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
    <div className="mx-auto max-w-[1880px]">
      <div className="h-[min(62vh,640px)] min-h-[440px] animate-pulse bg-gradient-to-t from-white/[0.02] to-transparent" />
      <div className="mt-8 flex gap-4 px-12">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="aspect-[3/4] w-[172px] animate-pulse rounded-md bg-white/[0.02]" />)}</div>
    </div>
  );
}
