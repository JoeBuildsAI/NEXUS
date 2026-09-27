import { Minus, Square, X, Zap } from "lucide-react";
import { config } from "@/core/config";
import { useModeStore } from "@/state/modeStore";
import { Badge } from "@/components/ui";

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "toggleMaximize") await w.toggleMaximize();
    else await w.hide(); // minimize-to-tray rather than exit
  } catch {
    // Browser dev — no-op.
  }
}

/** Borderless custom titlebar. The center strip is the OS drag region. */
export function TitleBar() {
  const mode = useModeStore((s) => s.current);

  return (
    <div className="drag-region flex h-9 shrink-0 items-center justify-between px-3 select-none">
      <div className="flex items-center gap-2.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15">
          <Zap size={12} className="text-accent" />
        </div>
        <span className="font-display text-xs font-semibold tracking-[0.3em] text-white/80">
          NEXUS
        </span>
        {config.demoMode && (
          <Badge tone="accent" className="ml-1">
            DEMO
          </Badge>
        )}
        {mode !== "normal" && (
          <Badge tone="warning" dot className="uppercase">
            {mode} MODE
          </Badge>
        )}
      </div>

      <div className="no-drag flex items-center gap-1">
        <WinButton onClick={() => windowAction("minimize")} label="Minimize">
          <Minus size={14} />
        </WinButton>
        <WinButton onClick={() => windowAction("toggleMaximize")} label="Maximize">
          <Square size={11} />
        </WinButton>
        <WinButton
          onClick={() => windowAction("close")}
          label="Close"
          danger
        >
          <X size={14} />
        </WinButton>
      </div>
    </div>
  );
}

function WinButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-6 w-8 items-center justify-center rounded-md text-white/50 transition-colors hover:text-white ${
        danger ? "hover:bg-status-critical/80" : "hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
