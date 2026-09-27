import { Lock, Trophy } from "lucide-react";
import type { Achievement } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Rarity tiers derived from global unlock percentage. */
export function rarityTier(globalPercent: number | null): { label: string; className: string } | null {
  if (globalPercent == null) return null;
  if (globalPercent < 5) return { label: "Legendary", className: "text-ember" };
  if (globalPercent < 10) return { label: "Ultra rare", className: "text-white/80" };
  if (globalPercent < 25) return { label: "Rare", className: "text-white/60" };
  return null;
}

/** Icon · title · metadata. Unlocked is bright and warm; locked recedes. */
export function AchievementRow({ achievement, compact, tracked }: { achievement: Achievement; compact?: boolean; tracked?: boolean }) {
  const { unlocked, hidden, name, description, globalPercent, unlockedAt } = achievement;
  const rarity = rarityTier(globalPercent);
  const secret = hidden && !unlocked;

  return (
    <div className={cn("group flex items-center gap-4 py-2.5 transition-opacity", !unlocked && "opacity-60 hover:opacity-100")}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm",
          compact ? "h-9 w-9" : "h-11 w-11",
          unlocked ? "bg-gradient-to-br from-ember/25 to-transparent text-ember" : "bg-white/[0.04] text-white/25",
        )}
      >
        {achievement.iconUrl && !secret ? (
          <img src={achievement.iconUrl} alt="" loading="lazy" className={cn("h-full w-full object-cover", !unlocked && "opacity-50 grayscale")} />
        ) : unlocked ? <Trophy size={compact ? 14 : 17} strokeWidth={1.75} /> : <Lock size={13} strokeWidth={1.75} />}
        {tracked && <span className="absolute -right-px -top-px h-2 w-2 rounded-full bg-white ring-2 ring-black" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <p className={cn("truncate text-[14px]", unlocked ? "text-white/90" : "text-white/70")}>{secret ? "Hidden achievement" : name}</p>
          {rarity && !secret && <span className={cn("shrink-0 text-micro", rarity.className)}>{rarity.label}</span>}
        </div>
        <p className="truncate text-[12px] text-white/40">{secret ? "Keep playing to reveal." : description}</p>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px] tabular">
        {globalPercent != null && <p className="text-white/45">{globalPercent.toFixed(1)}%</p>}
        <p className="text-white/25">{unlocked && unlockedAt ? formatRelativeTime(unlockedAt) : globalPercent != null ? "of players" : ""}</p>
      </div>
    </div>
  );
}
