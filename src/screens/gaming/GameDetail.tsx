import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Download, Play, Target, Trophy } from "lucide-react";
import { AchievementRow } from "./AchievementRow";
import { Badge, Button, Panel, PanelHeader, ProgressRing } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useNavigationStore } from "@/state/navigationStore";
import { actionRegistry } from "@/core/actions/registry";
import type { GameDetails } from "@/core/types";
import { completionPercent } from "@/core/types";
import { formatBytes, formatPlaytime, formatRelativeTime } from "@/lib/utils";

export function GameDetail({ gameId }: { gameId: string }) {
  const selectGame = useNavigationStore((s) => s.selectGame);
  const { data: game, loading } = useAsync<GameDetails | null>(
    () => getProviders().steam.getGameDetails(gameId),
    [gameId],
  );

  const closest = useMemo(() => {
    if (!game) return [];
    return [...game.achievements.achievements]
      .filter((a) => !a.unlocked && a.globalPercent != null)
      .sort((a, b) => (b.globalPercent ?? 0) - (a.globalPercent ?? 0))
      .slice(0, 3);
  }, [game]);

  if (loading || !game) {
    return (
      <div className="flex h-full items-center justify-center text-white/30">
        {loading ? "Loading…" : "Game not found"}
      </div>
    );
  }

  const pct = completionPercent(game.achievements);
  const recent = [...game.achievements.achievements]
    .filter((a) => a.unlocked && a.unlockedAt)
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
    .slice(0, 4);
  const remaining = game.achievements.achievements.filter((a) => !a.unlocked);

  return (
    <div className="flex h-full flex-col">
      {/* Hero */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ height: 240 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${game.coverColor} 0%, ${game.heroColor} 70%, #05070a 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-grid opacity-15" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-void-950 via-void-950/40 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-6">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => selectGame(null)}
          >
            <ArrowLeft size={15} /> Library
          </Button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {game.genres.map((g) => (
                <Badge key={g} tone="neutral">
                  {g}
                </Badge>
              ))}
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 font-display text-4xl font-bold tracking-wide2 text-white"
            >
              {game.title}
            </motion.h1>
            <p className="mt-1 text-sm text-white/50">
              {game.developer} · {game.publisher}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void actionRegistry.execute("launch-game", { args: { gameId } })}
          >
            <Play size={18} /> {game.installed ? "Play" : "Install & Play"}
          </Button>
          <Stat icon={<Clock size={15} />} label="Playtime" value={formatPlaytime(game.playtimeMinutes)} />
          {game.lastPlayed && (
            <Stat icon={<Play size={15} />} label="Last played" value={formatRelativeTime(game.lastPlayed)} />
          )}
          {game.installSizeBytes != null ? (
            <Stat icon={<Download size={15} />} label="Size" value={formatBytes(game.installSizeBytes, 1)} />
          ) : (
            <Stat icon={<Download size={15} />} label="Status" value="Not installed" />
          )}
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-white/55" data-selectable="true">
          {game.summary}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Achievement progress */}
          <Panel className="p-5 lg:col-span-1">
            <div className="flex items-center gap-5">
              <ProgressRing value={pct} size={110} label="Complete" color="#e6a15e" />
              <div>
                <p className="flex items-center gap-2 text-white/80">
                  <Trophy size={16} className="text-ember" />
                  <span className="font-mono text-2xl font-semibold">
                    {game.achievements.unlocked}
                  </span>
                  <span className="text-white/40">/ {game.achievements.total}</span>
                </p>
                <p className="mt-1 text-xs text-white/40">Achievements unlocked</p>
              </div>
            </div>

            {closest.length > 0 && (
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide2 text-accent/70">
                  <Target size={13} /> Closest Achievements
                </h4>
                <div className="space-y-2">
                  {closest.map((a) => (
                    <AchievementRow key={a.id} achievement={a} />
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* Recent achievements */}
          <Panel className="lg:col-span-2">
            <PanelHeader title="Recent Achievements" icon={<Trophy size={14} />} />
            <div className="space-y-2 px-4 pb-4">
              {recent.length > 0 ? (
                recent.map((a) => <AchievementRow key={a.id} achievement={a} />)
              ) : (
                <p className="px-1 py-6 text-center text-sm text-white/30">
                  No achievements unlocked yet.
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* Remaining achievements */}
        <Panel className="mt-4">
          <PanelHeader
            title={`Remaining Achievements · ${remaining.length}`}
            icon={<Target size={14} />}
          />
          <div className="grid grid-cols-1 gap-2 px-4 pb-4 lg:grid-cols-2">
            {remaining.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
      <span className="text-accent/60">{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-wide2 text-white/35">{label}</p>
        <p className="text-sm font-medium text-white/85">{value}</p>
      </div>
    </div>
  );
}
