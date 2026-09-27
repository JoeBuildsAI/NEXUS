import { useState } from "react";
import { motion } from "framer-motion";
import type { Game } from "@/core/types";
import { formatPlaytime, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface GameCardProps {
  game: Game;
  completion?: number;
  onClick: () => void;
}

/**
 * Generated artwork when no image exists: a deep monochrome field with a
 * single light source and the title set large — intentional, not a placeholder.
 */
export function GeneratedCover({ game, large }: { game: Game; large?: boolean }) {
  return (
    <div className="absolute inset-0 bg-[#050505]">
      <div className="absolute inset-0" style={{ background: `radial-gradient(110% 80% at 75% 0%, ${game.coverColor} 0%, transparent 62%)`, opacity: 0.6 }} />
      <div className="absolute inset-0 nx-noise opacity-[0.05]" />
      <div className={cn("absolute inset-x-0 top-0 overflow-hidden p-4", large && "p-8")}>
        <span className={cn("block font-display font-semibold uppercase leading-[0.92] tracking-tight text-white/[0.08] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]", large ? "text-[88px]" : "text-[28px]")}>
          {game.title}
        </span>
      </div>
      <div className="absolute inset-x-0 top-0 h-px bg-white/[0.07]" />
    </div>
  );
}

/** Cover tile. Artwork dominates; metadata reveals on hover. */
export function GameCard({ game, completion, onClick }: GameCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!game.coverUrl && !imgFailed;
  return (
    <motion.button
      onClick={onClick}
      whileHover="hover"
      className="no-drag group relative block aspect-[3/4] w-full overflow-hidden rounded-md bg-black text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      aria-label={game.title}
    >
      <motion.div className="absolute inset-0" variants={{ hover: { scale: 1.04 } }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <GeneratedCover game={game} />
        {showImg && <img src={game.coverUrl!} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
      </motion.div>

      {/* Light response */}
      <motion.div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" variants={{ hover: { opacity: 1 } }} initial={{ opacity: showImg ? 0.55 : 0.9 }} transition={{ duration: 0.4 }} />
      <motion.div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/0" variants={{ hover: { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" } }} transition={{ duration: 0.3 }} />

      {!game.installed && <span className="absolute right-2.5 top-2.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/55 backdrop-blur">Not installed</span>}

      <motion.div className="absolute inset-x-0 bottom-0 p-3.5" variants={{ hover: { y: 0, opacity: 1 } }} initial={{ y: showImg ? 6 : 0, opacity: showImg ? 0 : 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
        <h3 className="text-[13.5px] font-medium leading-tight text-white">{game.title}</h3>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] tabular text-white/50">
          {game.playtimeMinutes > 0 && <span>{formatPlaytime(game.playtimeMinutes)}</span>}
          {game.lastPlayed && <span>{formatRelativeTime(game.lastPlayed)}</span>}
          {completion != null && completion > 0 && <span className="ml-auto text-white/80">{completion}%</span>}
        </div>
        {completion != null && completion > 0 && (
          <div className="mt-2 h-px bg-white/15"><div className="h-full bg-white" style={{ width: `${completion}%` }} /></div>
        )}
      </motion.div>
    </motion.button>
  );
}
