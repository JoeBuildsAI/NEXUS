import { useState } from "react";
import { Clock, Download } from "lucide-react";
import type { Game } from "@/core/types";
import { formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface GameCardProps {
  game: Game;
  completion?: number;
  onClick: () => void;
}

/** Generated artwork: stable gradient + monogram, used when no image is available. */
export function GeneratedCover({ game, large }: { game: Game; large?: boolean }) {
  return (
    <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 30% 0%, ${game.coverColor} 0%, ${game.heroColor} 55%, #07090d 100%)` }}>
      <div className="absolute inset-0 bg-grid opacity-[0.12]" />
      <div className="absolute inset-0 nx-noise opacity-[0.06]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-display font-bold text-white/[0.07]", large ? "text-[220px]" : "text-6xl")}>{game.title.charAt(0)}</span>
      </div>
      <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
    </div>
  );
}

/** Cover-art tile: real artwork when available, generated fallback otherwise. */
export function GameCard({ game, completion, onClick }: GameCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!game.coverUrl && !imgFailed;
  return (
    <button
      onClick={onClick}
      className="no-drag group relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/[0.06] text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-glow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
    >
      <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
        <GeneratedCover game={game} />
        {showImg && (
          <img
            src={game.coverUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>

      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-void-950 via-void-950/70 to-transparent", showImg ? "h-1/2" : "h-2/3")} />

      {!game.installed && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-void-950/80 px-2 py-0.5 text-[10px] text-white/60">
          <Download size={10} /> Not installed
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="text-sm font-semibold leading-tight text-white drop-shadow">{game.title}</h3>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/55">
          {game.playtimeMinutes > 0 && (
            <>
              <Clock size={11} />
              <span>{formatPlaytime(game.playtimeMinutes)}</span>
            </>
          )}
          {game.lastPlayed && (
            <>
              {game.playtimeMinutes > 0 && <span className="text-white/25">·</span>}
              <span>{formatRelativeTime(game.lastPlayed)}</span>
            </>
          )}
        </div>
        {completion != null && completion > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-accent" style={{ width: `${completion}%` }} />
          </div>
        )}
      </div>
    </button>
  );
}
