import { Minus, Square, X } from "lucide-react";
import { config } from "@/core/config";
import { useModeStore } from "@/state/modeStore";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { useLibraryStore } from "@/state/libraryStore";
import { NexusMark } from "./NexusMark";

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "toggleMaximize") await w.toggleMaximize();
    else await w.close(); // native CloseRequested handler applies the user's tray/exit preference
  } catch {
    // Browser dev — no-op.
  }
}

/** Borderless titlebar: wordmark, quiet state text, window controls. */
export function TitleBar() {
  const mode = useModeStore((s) => s.current);
  const gameRunning = useModeStore((s) => s.gameRunning);
  const sessionTitle = useGameSessionStore((s) => s.title);
  const endSession = useGameSessionStore((s) => s.end);
  // Only claim "demo" while demo data is actually standing in for a real provider.
  const libraryMode = useLibraryStore((s) => s.mode);
  const libraryLoaded = useLibraryStore((s) => s.loadedAt != null);

  return (
    <div className="drag-region flex h-10 shrink-0 select-none items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <NexusMark size={14} className="text-white/80" />
        <span className="font-display text-[11px] font-semibold tracking-[0.34em] text-white/70">NEXUS</span>
        <span className="hidden items-center gap-3 text-micro text-white/30 sm:flex">
          {config.demoMode && libraryLoaded && libraryMode === "demo" && <span title="Steam not detected — the Gaming hub shows the demo library">demo library</span>}
          {mode !== "normal" && <span className="text-white/60">{mode} mode</span>}
          {gameRunning && (
            <button onClick={endSession} className="no-drag text-white/60 transition-colors hover:text-white" title="A game session is active; NEXUS runs with a reduced footprint. Click to end.">
              session · {sessionTitle ?? "game"} <span className="text-white/30">· end</span>
            </button>
          )}
        </span>
      </div>

      <div className="no-drag flex items-center">
        <WinButton onClick={() => windowAction("minimize")} label="Minimize"><Minus size={13} /></WinButton>
        <WinButton onClick={() => windowAction("toggleMaximize")} label="Maximize"><Square size={10} /></WinButton>
        <WinButton onClick={() => windowAction("close")} label="Close" danger><X size={13} /></WinButton>
      </div>
    </div>
  );
}

function WinButton({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-7 w-9 items-center justify-center rounded-sm text-white/35 transition-colors hover:text-white ${danger ? "hover:bg-status-critical/70" : "hover:bg-white/[0.08]"}`}
    >
      {children}
    </button>
  );
}
