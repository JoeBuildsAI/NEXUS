import { useMemo } from "react";
import { GameCard } from "./GameCard";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useNavigationStore } from "@/state/navigationStore";
import type { Game } from "@/core/types";
import { DEMO_GAMES } from "@/core/demo/games";

function completionFor(gameId: string): number {
  const d = DEMO_GAMES.find((g) => g.id === gameId);
  if (!d || d.achievements.total === 0) return 0;
  return Math.round((d.achievements.unlocked / d.achievements.total) * 100);
}

interface Section {
  title: string;
  games: Game[];
}

export function GameLibrary() {
  const selectGame = useNavigationStore((s) => s.selectGame);
  const { data: games, loading } = useAsync<readonly Game[]>(
    () => getProviders().steam.getGames(),
    [],
  );

  const sections = useMemo<Section[]>(() => {
    const all = [...(games ?? [])];
    const byRecent = [...all]
      .filter((g) => g.lastPlayed)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    return [
      { title: "Continue Playing", games: byRecent.filter((g) => g.installed).slice(0, 4) },
      { title: "Recently Played", games: byRecent.slice(0, 6) },
      { title: "Installed", games: all.filter((g) => g.installed) },
      {
        title: "Completion",
        games: [...all].sort(
          (a, b) => completionFor(b.id) - completionFor(a.id),
        ),
      },
    ];
  }, [games]);

  const totalUnlocked = DEMO_GAMES.reduce((s, g) => s + g.achievements.unlocked, 0);
  const totalAch = DEMO_GAMES.reduce((s, g) => s + g.achievements.total, 0);

  return (
    <ScreenShell
      title="Gaming"
      subtitle={`${games?.length ?? 0} games · ${totalUnlocked}/${totalAch} achievements unlocked`}
    >
      {loading ? (
        <LibrarySkeleton />
      ) : (
        <div className="space-y-8">
          {sections.map((section) =>
            section.games.length > 0 ? (
              <section key={section.title}>
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide2 text-white/45">
                  {section.title}
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                  {section.games.map((game) => (
                    <GameCard
                      key={`${section.title}-${game.id}`}
                      game={game}
                      completion={completionFor(game.id)}
                      onClick={() => selectGame(game.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}
    </ScreenShell>
  );
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[3/4] animate-pulse rounded-xl bg-white/[0.04]"
        />
      ))}
    </div>
  );
}
