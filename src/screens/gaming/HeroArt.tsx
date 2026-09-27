import { useState } from "react";
import { motion } from "framer-motion";
import type { Game } from "@/core/types";
import { cn } from "@/lib/utils";

/** Cinematic hero background: real hero art if available, generated otherwise. */
export function HeroArt({ game, className, monogram = true }: { game: Game; className?: string; monogram?: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!game.heroUrl && !failed;
  return (
    <motion.div
      initial={{ scale: 1.04, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{ background: `linear-gradient(120deg, ${game.coverColor} 0%, ${game.heroColor} 55%, #05070a 100%)` }}
    >
      <div className="absolute inset-0 bg-grid opacity-10" />
      {showImg && (
        <img src={game.heroUrl!} alt="" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover opacity-90" />
      )}
      {!showImg && monogram && (
        <span className="absolute -right-4 -top-16 select-none font-display text-[420px] font-black leading-none text-white/[0.035]">{game.title.charAt(0)}</span>
      )}
    </motion.div>
  );
}
