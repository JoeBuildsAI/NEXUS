import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import type { GameDetails } from "@/core/types";
import { completionPercent } from "@/core/types";
import { actionRegistry } from "@/core/actions/registry";
import { useLibraryStore } from "@/state/libraryStore";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { Button, ContextMenu } from "@/components/ui";
import { gameContextItems } from "./gameContextItems";
import { cn } from "@/lib/utils";

/**
 * Console-style horizontal rail. Selection is a single index driven by mouse,
 * ← → (keyboard) and, through the same handlers, any controller mapped to
 * arrow keys by Windows. The selected game expands context below the rail.
 * Provider differences stay explicit: no achievements → no invented numbers.
 */
export function GameRail({ games, selectedId, onSelect, onOpen }: { games: readonly GameDetails[]; selectedId: string | null; onSelect: (id: string) => void; onOpen: (id: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const index = Math.max(0, games.findIndex((g) => g.id === selectedId));
  const selected = games[index] ?? null;
  const session = useGameSessionStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !games.length) return;
      if (e.key === "ArrowRight") { onSelect(games[Math.min(games.length - 1, index + 1)]!.id); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { onSelect(games[Math.max(0, index - 1)]!.id); e.preventDefault(); }
      else if (e.key === "Home") { onSelect(games[0]!.id); e.preventDefault(); }
      else if (e.key === "End") { onSelect(games[games.length - 1]!.id); e.preventDefault(); }
      else if (e.key === "Enter" && selected) { void actionRegistry.execute("launch-game", { args: { gameId: selected.id } }); e.preventDefault(); }
      else if ((e.key === "d" || e.key === "D" || e.key === " ") && selected) { onOpen(selected.id); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [games, index, selected, onSelect, onOpen]);

  useEffect(() => {
    scroller.current?.querySelector(`[data-rail-index="${index}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);
  useEffect(() => { if (selected) void useLibraryStore.getState().ensureDetails([selected.id]); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const recent = useMemo(() => (selected?.achievements.achievements ?? []).filter((a) => a.unlocked && a.unlockedAt).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)).slice(0, 3), [selected]);
  const next = useMemo(() => (selected?.achievements.achievements ?? []).filter((a) => !a.unlocked && !a.hidden).sort((a, b) => (b.globalPercent ?? 0) - (a.globalPercent ?? 0)).slice(0, 3), [selected]);
  const active = session.phase === "active" && session.gameId === selected?.id;

  return (
    <section aria-label="Game rail">
      <div ref={scroller} className="-mx-12 flex gap-4 overflow-x-auto px-12 pb-4 pt-2 [scrollbar-width:none] 2xl:-mx-16 2xl:px-16 [&::-webkit-scrollbar]:hidden" role="listbox" aria-activedescendant={selected ? `rail-${selected.id}` : undefined}>
        {games.map((g, i) => {
          const on = i === index;
          return (
            <ContextMenu key={g.id} items={gameContextItems(g, { select: onOpen })}>
              <button
                id={`rail-${g.id}`}
                role="option"
                aria-selected={on}
                data-rail-index={i}
                onClick={() => (on ? onOpen(g.id) : onSelect(g.id))}
                onDoubleClick={() => void actionRegistry.execute("launch-game", { args: { gameId: g.id } })}
                className={cn("group relative shrink-0 overflow-hidden rounded-sm transition-[transform,box-shadow] duration-300 ease-nexus focus-visible:outline-none", on ? "z-10 scale-[1.06] shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_24px_60px_-20px_rgba(0,0,0,0.9)]" : "opacity-75 hover:opacity-100")}
                style={{ width: 168, height: 252, background: `linear-gradient(160deg, ${g.coverColor}, #000 130%)` }}
              >
                {g.coverUrl && <img src={g.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                {!g.installed && <span className="absolute left-2 top-2 text-micro text-white/60">Not installed</span>}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8 text-left">
                  <span className="block truncate text-[12.5px] text-white/90">{g.title}</span>
                  {g.achievements.total > 0 && <span className="block font-mono text-[10.5px] tabular text-white/45">{completionPercent(g.achievements)}%</span>}
                </span>
              </button>
            </ContextMenu>
          );
        })}
      </div>

      {selected && (
        <motion.div key={selected.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-4 grid gap-x-14 gap-y-6 lg:grid-cols-[1fr_1fr_1fr]">
          <div>
            <p className="text-micro text-white/35">{selected.launcher === "steam" ? "Steam" : selected.launcher}{selected.installed ? " · installed" : " · not installed"}{active ? " · running" : ""}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-7 gap-y-1 font-mono text-[12.5px] tabular text-white/55">
              {selected.playtimeMinutes > 0 ? <span><span className="text-white/90">{formatPlaytime(selected.playtimeMinutes)}</span> played</span> : <span className="text-white/35">no playtime data</span>}
              {selected.lastPlayed && <span>last {formatRelativeTime(selected.lastPlayed)}</span>}
              {selected.achievements.total === 0 && <span className="text-white/35">{selected.achievements.status === "private-profile" ? "achievements private" : selected.achievements.status === "not-configured" ? "achievements need a Steam key" : "no achievements"}</span>}
            </div>
            <div className="mt-4 flex items-center gap-3">
              {!selected.installed && <Button size="sm" variant="ghost" onClick={() => onOpen(selected.id)}>Details</Button>}
              <span className="text-[11.5px] text-white/25">← → select · Enter play · D details · double-click launch</span>
            </div>
          </div>
          <div>
            <p className="text-micro text-white/35">Recent achievements</p>
            <ul className="mt-2 space-y-1.5">
              {recent.map((a) => <li key={a.id} className="flex items-baseline gap-3 text-[13.5px]"><span className="truncate text-white/85">{a.name}</span><span className="ml-auto shrink-0 font-mono text-[11px] tabular text-white/35">{a.unlockedAt ? formatRelativeTime(a.unlockedAt) : ""}</span></li>)}
              {recent.length === 0 && <li className="text-[13px] text-white/30">{selected.achievements.total ? "Nothing unlocked yet." : "—"}</li>}
            </ul>
          </div>
          <div>
            <p className="text-micro text-white/35">Closest to unlock</p>
            <ul className="mt-2 space-y-1.5">
              {next.map((a) => <li key={a.id} className="flex items-baseline gap-3 text-[13.5px]"><span className="truncate text-white/85">{a.name}</span>{a.globalPercent != null && <span className="ml-auto shrink-0 font-mono text-[11px] tabular text-white/35">{Math.round(a.globalPercent)}% of players</span>}</li>)}
              {next.length === 0 && <li className="text-[13px] text-white/30">{selected.achievements.total ? "All visible achievements unlocked." : "—"}</li>}
            </ul>
          </div>
        </motion.div>
      )}
    </section>
  );
}
