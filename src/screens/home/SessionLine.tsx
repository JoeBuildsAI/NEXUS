import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { useNavigationStore } from "@/state/navigationStore";

function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Home line while a game NEXUS launched is running:
 *   CYBERPUNK 2077 · SESSION ACTIVE · 01:42:13
 * Ticks once a second only while active; nothing is injected into the game.
 */
export function SessionLine() {
  const phase = useGameSessionStore((s) => s.phase);
  const title = useGameSessionStore((s) => s.title);
  const gameId = useGameSessionStore((s) => s.gameId);
  const startedAt = useGameSessionStore((s) => s.startedAt);
  const navigate = useNavigationStore((s) => s.navigate);
  const selectGame = useNavigationStore((s) => s.selectGame);
  const [now, setNow] = useState(Date.now());
  const active = phase === "active" || phase === "launch-requested";
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!active || !title) return null;
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => { if (gameId) { navigate("gaming"); selectGame(gameId); } }}
      className="mt-5 flex items-baseline gap-4 text-left"
    >
      <span className="font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-white/85">{title}</span>
      <span className="h-3 w-px bg-white/15" />
      <span className="font-display text-[13px] tracking-[0.3em] text-ember">{phase === "active" ? "SESSION ACTIVE" : "LAUNCHING"}</span>
      {phase === "active" && startedAt && <span className="font-mono text-[13px] tabular text-white/50">{hms(now - startedAt)}</span>}
    </motion.button>
  );
}
