import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play, Search, Target } from "lucide-react";
import { GameCard } from "./GameCard";
import { HeroArt } from "./HeroArt";
import { useLibraryStore } from "@/state/libraryStore";
import { useNavigationStore } from "@/state/navigationStore";
import { useDevStore } from "@/state/devStore";
import { useGamePrefsStore } from "@/state/gamePrefsStore";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { actionRegistry } from "@/core/actions/registry";
import { completionPercent, type Game, type GameDetails } from "@/core/types";
import { bucketFor, libraryTotals } from "@/core/gaming/completion";
import { formatBytes, formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { Button, ContextMenu } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { gameContextItems } from "./gameContextItems";
import { cn, displayTitleClass } from "@/lib/utils";

type SortKey = "recent" | "name" | "playtime" | "completion" | "size";
type FilterKey = "all" | "installed" | "completed" | "near" | "in-progress" | "no-achievements";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" },
  { id: "playtime", label: "Playtime" },
  { id: "completion", label: "Completion" },
  { id: "size", label: "Size" },
];
const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "completed", label: "Completed" },
  { id: "near", label: "Near completion" },
  { id: "in-progress", label: "In progress" },
  { id: "no-achievements", label: "No achievements" },
];
const PAGE = 48;

function sortGames(games: GameDetails[], key: SortKey): GameDetails[] {
  const c = [...games];
  switch (key) {
    case "name": return c.sort((a, b) => a.title.localeCompare(b.title));
    case "playtime": return c.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
    case "completion": return c.sort((a, b) => completionPercent(b.achievements) - completionPercent(a.achievements));
    case "size": return c.sort((a, b) => (b.installSizeBytes ?? 0) - (a.installSizeBytes ?? 0));
    default: return c.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.title.localeCompare(b.title));
  }
}
function filterGames(games: GameDetails[], key: FilterKey): GameDetails[] {
  switch (key) {
    case "installed": return games.filter((g) => g.installed);
    case "completed": return games.filter((g) => bucketFor(g) === "completed");
    case "near": return games.filter((g) => bucketFor(g) === "near");
    case "in-progress": return games.filter((g) => ["in-progress", "not-started"].includes(bucketFor(g)));
    case "no-achievements": return games.filter((g) => g.achievements.total === 0 && (g.achievements.status === "no-achievements" || g.achievements.status === "ok"));
    default: return games;
  }
}

export function GameLibrary() {
  const selectGame = useNavigationStore((s) => s.selectGame);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const steamConnected = useDevStore((s) => s.steamConnected);
  const tracked = useGamePrefsStore((s) => s.tracked);
  const session = useGameSessionStore();
  const games = useLibraryStore((s) => s.games);
  const details = useLibraryStore((s) => s.details);
  const loading = useLibraryStore((s) => s.loading);
  const loadedAt = useLibraryStore((s) => s.loadedAt);
  const offline = useLibraryStore((s) => s.offline);
  const mode = useLibraryStore((s) => s.mode);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(1);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useLibraryStore.getState().load({ force: true });
  }, [steamConnected]);

  const all = useMemo(() => useLibraryStore.getState().withDetails(), [games, details]); // eslint-disable-line react-hooks/exhaustive-deps
  const featured = useMemo(() => [...all].filter((g) => g.installed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0], [all]);
  const recent = useMemo(() => [...all].filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)).slice(0, 12), [all]);

  // Progressive detail fetch: featured + recent first; whole library only when small.
  const gameIds = useMemo(() => games.map((g) => g.id), [games]);
  useEffect(() => {
    if (gameIds.length === 0) return;
    const store = useLibraryStore.getState();
    const priority = [featured?.id, ...recent.map((g) => g.id)].filter((x): x is string => !!x);
    void store.ensureDetails(priority).then(() => {
      if (gameIds.length <= 60) void store.ensureDetails(gameIds, { concurrency: 2 });
    });
  }, [gameIds, featured?.id, recent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? all.filter((g) => g.title.toLowerCase().includes(q)) : filterGames(all, filter);
    return sortGames(base, sort);
  }, [all, query, filter, sort]);
  const visible = filtered.slice(0, page * PAGE);

  // Fetch details for what is on screen (large libraries) and load more on scroll.
  useEffect(() => {
    void useLibraryStore.getState().ensureDetails(visible.slice(Math.max(0, (page - 1) * PAGE)).map((g) => g.id), { concurrency: 2 });
  }, [page, visible.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting && visible.length < filtered.length) setPage((p) => p + 1); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible.length, filtered.length]);
  useEffect(() => setPage(1), [query, filter, sort]);

  const totals = useMemo(() => libraryTotals(all), [all]);
  const trackedTop = tracked[0];
  const large = games.length > 24;

  if (offline) {
    return <EmptyState eyebrow="Steam" title="Not connected" body="NEXUS will detect Steam automatically when available." action={<Button variant="outline" size="sm" onClick={() => { navigate("settings"); setSection("integrations"); }}>Configure</Button>} />;
  }
  if ((loading || !loadedAt) && games.length === 0) return <LibrarySkeleton />;
  if (games.length === 0) return <EmptyState eyebrow="Steam" title="No installed games" body="Steam was detected but its libraries contain no installed games." />;

  return (
    <div className="h-full overflow-y-auto">
      {featured && (
        <ContextMenu items={gameContextItems(featured, { select: selectGame })}>
          <div className="relative h-[min(58vh,600px)] min-h-[420px]">
            <HeroArt game={featured} />
            <div className="relative mx-auto flex h-full max-w-[1880px] flex-col justify-end px-12 pb-12 2xl:px-16">
              <div className="flex items-end justify-between gap-10">
                <div className="max-w-3xl">
                  <p className="text-micro tracking-cinematic text-white/40">
                    {mode === "demo" ? "Demo library · " : ""}
                    {session.phase === "active" && session.gameId === featured.id ? "Session active" : featured.lastPlayed ? `Continue · ${formatRelativeTime(featured.lastPlayed)}` : "Ready"}
                  </p>
                  <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className={cn("mt-4 break-words font-display font-semibold uppercase tracking-wide text-white", displayTitleClass(featured.title))}>
                    {featured.title}
                  </motion.h1>
                  <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[12.5px] tabular text-white/55">
                    {featured.achievements.total > 0 && <span><span className="text-white/90">{featured.achievements.unlocked} / {featured.achievements.total}</span> achievements</span>}
                    {featured.achievements.total > 0 && <span><span className="text-white/90">{completionPercent(featured.achievements)}%</span> complete</span>}
                    {featured.playtimeMinutes > 0 && <span><span className="text-white/90">{formatPlaytime(featured.playtimeMinutes)}</span> played</span>}
                    {featured.installSizeBytes != null && <span><span className="text-white/90">{formatBytes(featured.installSizeBytes, 0)}</span> on disk</span>}
                  </div>
                  <div className="mt-8 flex items-center gap-3">
                    <Button variant="primary" size="lg" onClick={() => void actionRegistry.execute("launch-game", { args: { gameId: featured.id } })}>
                      <Play size={16} fill="currentColor" /> {session.phase === "active" && session.gameId === featured.id ? "Running" : "Continue"}
                    </Button>
                    <Button variant="ghost" size="lg" onClick={() => selectGame(featured.id)}>Details</Button>
                  </div>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 font-mono text-[12px] tabular text-white/40 lg:flex">
                  <Stat n={totals.games} label="games" />
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
          {recent.length > 0 && !query && filter === "all" && <GameRow title="Recently played" games={recent} onSelect={(g) => selectGame(g.id)} />}

          {/* Library controls */}
          <section>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-5 text-[13px]">
                {FILTERS.map((f) => (
                  <button key={f.id} onClick={() => { setFilter(f.id); setQuery(""); }} className={cn("relative pb-1 transition-colors", filter === f.id && !query ? "text-white" : "text-white/35 hover:text-white/70")}>
                    {f.label}{filter === f.id && !query && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4 text-micro">
                  {SORTS.map((s) => (
                    <button key={s.id} onClick={() => setSort(s.id)} className={cn("transition-colors", sort === s.id ? "text-white" : "text-white/30 hover:text-white/60")}>{s.label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Search size={13} className="text-white/30" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search library" className="h-8 w-40 border-b border-white/10 bg-transparent text-sm text-white/85 placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
                </div>
              </div>
            </div>
            <p className="label mb-4">{query ? `Results · ${filtered.length}` : `${FILTERS.find((f) => f.id === filter)?.label} · ${filtered.length}`}</p>
            {filtered.length === 0 ? (
              <p className="py-10 text-sm text-white/35">Nothing matches.</p>
            ) : (
              <div className={cn("grid gap-4", large ? "grid-cols-[repeat(auto-fill,minmax(150px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(172px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(172px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(196px,1fr))]")}>
                {visible.map((g) => (
                  <ContextMenu key={g.id} items={gameContextItems(g, { select: selectGame })}>
                    <GameCard game={g} completion={g.achievements.total ? completionPercent(g.achievements) : undefined} onClick={() => selectGame(g.id)} />
                  </ContextMenu>
                ))}
              </div>
            )}
            <div ref={sentinel} className="h-px" />
            {visible.length < filtered.length && <p className="mt-6 text-micro text-white/30">{visible.length} of {filtered.length} · scroll for more</p>}
          </section>

          {totals.total > 0 && !large && (
            <section>
              <p className="label mb-6">Completion</p>
              <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-3">
                <CompletionColumn title="Completed" games={all.filter((g) => bucketFor(g) === "completed")} onSelect={(g) => selectGame(g.id)} />
                <CompletionColumn title="Near completion" games={all.filter((g) => bucketFor(g) === "near")} onSelect={(g) => selectGame(g.id)} />
                <CompletionColumn title="In progress" games={all.filter((g) => ["in-progress", "not-started"].includes(bucketFor(g)))} onSelect={(g) => selectGame(g.id)} />
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
          {games.slice(0, 8).map((g) => {
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
      <div className="h-[min(58vh,600px)] min-h-[420px] animate-pulse bg-gradient-to-t from-white/[0.02] to-transparent" />
      <div className="mt-8 flex gap-4 px-12">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="aspect-[3/4] w-[172px] animate-pulse rounded-md bg-white/[0.02]" />)}</div>
    </div>
  );
}
