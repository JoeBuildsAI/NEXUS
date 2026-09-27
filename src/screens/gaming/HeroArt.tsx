import { useState } from "react";
import { motion } from "framer-motion";
import type { Game } from "@/core/types";
import { cn } from "@/lib/utils";

/**
 * Cinematic hero: artwork (or a single-light generated field) fading into
 * black on the left and bottom so type can sit directly on it.
 */
export function HeroArt({ game, className, align = "right" }: { game: Game; className?: string; align?: "right" | "full" }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!game.heroUrl && !failed;
  return (
    <motion.div
      initial={{ scale: 1.03, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className={cn("absolute inset-0 overflow-hidden bg-black", className)}
    >
      <div className={cn("absolute inset-y-0 right-0", align === "right" ? "w-[68%]" : "w-full")}>
        {showImg ? (
          <img src={game.heroUrl!} alt="" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `radial-gradient(70% 90% at 75% 30%, ${game.coverColor} 0%, ${game.heroColor} 40%, #000 80%)`, opacity: 0.7 }}>
            <div className="absolute inset-0 nx-noise opacity-[0.05]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
      </div>
    </motion.div>
  );
}
