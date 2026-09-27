import { Clock, Download } from "lucide-react";
import type { Game } from "@/core/types";
import { formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface GameCardProps {
  game: Game;
  completion?: number;
  onClick: () => void;
}

/** Cover-art style game tile with gradient placeholder + hover elevation. */
export function GameCard({ game, completion, onClick }: GameCardProps) {
  return (
    <button
      onClick={onClick}
      className="no-drag group relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/[0.06] text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-glow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
    >
      {/* Cover placeholder gradient */}
      <div
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
        style={{
          background: `radial-gradient(120% 80% at 30% 0%, ${game.coverColor} 0%, ${game.heroColor} 55%, #07090d 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-grid opacity-[0.12]" />
        <div className="absolute inset-0 nx-noise opacity-[0.06]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-6xl font-bold text-white/[0.07]">
            {game.title.charAt(0)}
          </span>
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
      </div>

      {/* Gradient scrim */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-void-950 via-void-950/70 to-transparent" />

      {!game.installed && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-void-950/80 px-2 py-0.5 text-[10px] text-white/60">
          <Download size={10} /> Not installed
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="text-sm font-semibold leading-tight text-white">
          {game.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/50">
          <Clock size={11} />
          <span>{formatPlaytime(game.playtimeMinutes)}</span>
          {game.lastPlayed && (
            <>
              <span className="text-white/25">·</span>
              <span>{formatRelativeTime(game.lastPlayed)}</span>
            </>
          )}
        </div>
        {completion != null && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
            <div
              className={cn("h-full rounded-full bg-accent")}
              style={{ width: `${completion}%` }}
            />
          </div>
        )}
      </div>
    </button>
  );
}
