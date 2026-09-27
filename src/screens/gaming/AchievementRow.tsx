import { Lock, Trophy } from "lucide-react";
import type { Achievement } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Rarity tiers derived from global unlock percentage. */
export function rarityTier(globalPercent: number | null): { label: string; className: string } | null {
  if (globalPercent == null) return null;
  if (globalPercent < 5) return { label: "Legendary", className: "text-ember border-ember/40 bg-ember/10" };
  if (globalPercent < 10) return { label: "Ultra rare", className: "text-[#c9a0ff] border-[#c9a0ff]/40 bg-[#c9a0ff]/10" };
  if (globalPercent < 25) return { label: "Rare", className: "text-accent border-accent/40 bg-accent/10" };
  if (globalPercent < 50) return { label: "Uncommon", className: "text-white/60 border-white/15 bg-white/[0.04]" };
  return null;
}

export function AchievementRow({ achievement, compact }: { achievement: Achievement; compact?: boolean }) {
  const { unlocked, hidden, name, description, globalPercent, unlockedAt } = achievement;
  const rarity = rarityTier(globalPercent);
  const secret = hidden && !unlocked;

  return (
    <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors", unlocked ? "hover:bg-white/[0.03]" : "opacity-75 hover:opacity-100")}>
      <div className={cn("flex shrink-0 items-center justify-center rounded-lg", compact ? "h-9 w-9" : "h-11 w-11", unlocked ? "bg-gradient-to-br from-ember/30 to-ember/5 text-ember shadow-[0_0_16px_-4px_rgba(230,161,94,0.5)]" : "bg-white/[0.04] text-white/25")}>
        {unlocked ? <Trophy size={compact ? 15 : 18} /> : <Lock size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-sm", unlocked ? "font-medium text-white/90" : "text-white/70")}>{secret ? "Hidden achievement" : name}</p>
          {rarity && !secret && <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wide2", rarity.className)}>{rarity.label}</span>}
        </div>
        <p className="truncate text-xs text-white/40">{secret ? "Keep playing to reveal." : description}</p>
      </div>
      <div className="shrink-0 text-right">
        {globalPercent != null && <p className="font-mono text-xs tabular-nums text-white/45">{globalPercent.toFixed(1)}%</p>}
        {unlocked && unlockedAt && <p className="text-[10px] text-white/30">{formatRelativeTime(unlockedAt)}</p>}
        {!unlocked && globalPercent != null && <p className="text-[10px] text-white/25">of players</p>}
      </div>
    </div>
  );
}
