import { Lock, Trophy } from "lucide-react";
import type { Achievement } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function AchievementRow({ achievement }: { achievement: Achievement }) {
  const { unlocked, hidden, name, description, globalPercent, unlockedAt } = achievement;
  const rare = globalPercent != null && globalPercent < 10;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        unlocked
          ? "border-white/[0.08] bg-white/[0.03]"
          : "border-white/[0.04] bg-transparent opacity-70",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          unlocked ? "bg-ember/15 text-ember" : "bg-white/[0.04] text-white/30",
        )}
      >
        {unlocked ? <Trophy size={17} /> : <Lock size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-white/90">
            {hidden && !unlocked ? "Hidden Achievement" : name}
          </p>
          {rare && (
            <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              Rare
            </span>
          )}
        </div>
        <p className="truncate text-xs text-white/45">
          {hidden && !unlocked ? "Keep playing to reveal this achievement." : description}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {globalPercent != null && (
          <p className="font-mono text-xs text-white/40">{globalPercent}%</p>
        )}
        {unlocked && unlockedAt && (
          <p className="text-[10px] text-white/30">{formatRelativeTime(unlockedAt)}</p>
        )}
      </div>
    </div>
  );
}
