import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useMediaStore } from "@/state/mediaStore";
import { notify } from "@/state/toastStore";
import { formatRelativeTime } from "@/lib/utils";

/**
 * Saved workspaces: layout mode, players, fit/loop/A–B, volume, primary and
 * (optionally) positions. Restoring never auto-plays.
 */
export function SavedWorkspaces({ onClose, positions }: { onClose: () => void; positions?: () => Record<number, number> }) {
  const { savedLayouts, saveWorkspace, restoreLayout, renameLayout, deleteLayout, defaults, slots } = useMediaStore();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const loaded = slots.filter((s) => s.itemId).length;

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const save = () => {
    const n = name.trim() || `Workspace ${savedLayouts.length + 1}`;
    saveWorkspace(n, defaults.restorePosition && positions ? positions() : undefined);
    setName("");
    notify.success("Workspace saved", n);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div ref={ref} className="glass-strong w-[520px] max-w-[92vw] rounded-md p-6">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-display-sm font-semibold uppercase tracking-wide2 text-white">Workspaces</p>
          <button onClick={onClose} className="text-[13px] text-white/35 hover:text-white">Close</button>
        </div>
        <p className="mt-2 text-[13px] text-white/40">Layout, players, fit, loops and A–B segments. Restored workspaces stay paused until you play.</p>

        <ul className="mt-5 max-h-[40vh] space-y-1 overflow-y-auto">
          {savedLayouts.length === 0 && <li className="py-3 text-[13px] text-white/35">Nothing saved yet.</li>}
          {savedLayouts.map((l) => (
            <li key={l.id} className="group flex items-center gap-3 py-2">
              {renaming === l.id ? (
                <input autoFocus defaultValue={l.name} onBlur={(e) => { renameLayout(l.id, e.target.value || l.name); setRenaming(null); }} onKeyDown={(e) => { if (e.key === "Enter") { renameLayout(l.id, (e.target as HTMLInputElement).value || l.name); setRenaming(null); } }} className="h-8 flex-1 border-b border-white/20 bg-transparent text-[14px] text-white focus:outline-none" />
              ) : (
                <button onClick={() => { restoreLayout(l.id); onClose(); notify.neutral("Workspace restored", "Paused — press play when ready."); }} className="flex flex-1 items-baseline justify-between gap-4 text-left">
                  <span className="truncate text-[14px] text-white/85">{l.name}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular text-white/35">{(l.players?.length ?? l.slots.filter(Boolean).length)} players · {formatRelativeTime(l.savedAt)}</span>
                </button>
              )}
              <button onClick={() => setRenaming(l.id)} aria-label="Rename" className="text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"><Pencil size={12} /></button>
              <button onClick={() => deleteLayout(l.id)} aria-label="Delete" className="text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center gap-3 border-t border-white/[0.08] pt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={loaded ? "Name this workspace" : "Add players to save a workspace"} disabled={!loaded} onKeyDown={(e) => e.key === "Enter" && save()} className="h-9 flex-1 border-b border-white/15 bg-transparent text-[14px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none disabled:opacity-40" />
          <button onClick={save} disabled={!loaded} className="text-[13px] text-white/70 transition-colors hover:text-white disabled:opacity-30">Save current</button>
        </div>
      </div>
    </div>
  );
}
