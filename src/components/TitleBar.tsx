import { Minus, Square, SquarePlus, X } from "lucide-react";
import { native } from "@/core/native";
import { usePlayer } from "@/state/player";

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  try {
    const w = await native.window();
    if (action === "minimize") await w.minimize();
    else if (action === "toggleMaximize") await w.toggleMaximize();
    else await w.close();
  } catch {
    // browser preview
  }
}

/** Borderless title bar: wordmark, the playing file, window controls. */
export function TitleBar() {
  const current = usePlayer((s) => s.current);
  const name = usePlayer((s) => s.listing?.videos.find((v) => v.path === current)?.name);

  return (
    <div className="drag-region flex h-9 shrink-0 select-none items-center gap-4 border-b border-white/[0.05] pl-4" onDoubleClick={() => void windowAction("toggleMaximize")}>
      <span className="text-[11px] font-semibold tracking-[0.34em] text-white/70">NEXUS</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-white/45">{name ?? ""}</span>
      <div className="no-drag flex items-center">
        <WinButton onClick={() => void native.newWindow()} label="New window (Ctrl+N)"><SquarePlus size={14} /></WinButton>
        <WinButton onClick={() => void windowAction("minimize")} label="Minimize"><Minus size={13} /></WinButton>
        <WinButton onClick={() => void windowAction("toggleMaximize")} label="Maximize"><Square size={10} /></WinButton>
        <WinButton onClick={() => void windowAction("close")} label="Close" danger><X size={13} /></WinButton>
      </div>
    </div>
  );
}

function WinButton({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={`flex h-9 w-11 items-center justify-center text-white/40 transition-colors hover:text-white ${danger ? "hover:bg-red-600/80" : "hover:bg-white/[0.08]"}`}>
      {children}
    </button>
  );
}
