import { useEffect, useState } from "react";
import type { Game } from "@/core/types";
import { cn } from "@/lib/utils";

/**
 * Game cover with honest fallbacks: a failed or missing image leaves the
 * generated title gradient instead of a broken-image glyph. Xbox PC titles only
 * ship a small square logo, so it is shown centered rather than stretched into
 * a 2:3 poster.
 */
export function CoverImage({ game, className, onFail }: { game: Pick<Game, "coverUrl" | "launcher">; className?: string; onFail?: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.coverUrl]);
  useEffect(() => { if (failed) onFail?.(); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!game.coverUrl || failed) return null;
  const logo = game.launcher === "xbox";
  return (
    <img
      src={game.coverUrl}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn(logo ? "absolute left-1/2 top-[38%] w-[46%] -translate-x-1/2 -translate-y-1/2 object-contain" : "absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}
