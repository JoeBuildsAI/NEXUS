import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Sparkles, Terminal } from "lucide-react";
import { useNavigationStore } from "@/state/navigationStore";
import { useConfirmStore } from "@/state/confirmStore";
import { getProviders } from "@/providers";
import { actionRegistry } from "@/core/actions/registry";
import type { AssistantMatch } from "@/providers/assistant/AssistantProvider";
import { cn } from "@/lib/utils";

/**
 * Global command palette (Ctrl+Space). Uses the assistant provider to interpret
 * natural-ish input into registered actions, and enforces confirmation for any
 * action that requires it before execution.
 */
export function CommandPalette() {
  const open = useNavigationStore((s) => s.commandPaletteOpen);
  const close = useNavigationStore((s) => s.closeCommandPalette);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly AssistantMatch[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const assistant = useMemo(() => getProviders().assistant, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    void assistant.interpret(query).then((m) => {
      if (!cancelled) {
        setMatches(m);
        setSelected(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, assistant]);

  const run = (match: AssistantMatch) => {
    const def = actionRegistry.get(match.actionId);
    close();
    if (!def) return;
    if (def.requiresConfirmation) {
      useConfirmStore.getState().confirm({
        title: def.title,
        message: def.description,
        danger: true,
        onConfirm: () => void actionRegistry.execute(match.actionId, { args: match.args }, true),
      });
    } else {
      void actionRegistry.execute(match.actionId, { args: match.args });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[selected];
      if (m) run(m);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-start justify-center pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-void-950/60 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            initial={{ scale: 0.97, y: -12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.98, y: -8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass-strong relative w-full max-w-2xl overflow-hidden rounded-2xl shadow-panel"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5">
              <Sparkles size={18} className="text-accent" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask NEXUS…  try 'gaming', 'system health', 'privacy'"
                className="h-14 flex-1 bg-transparent text-base text-white/90 placeholder:text-white/30 focus:outline-none"
              />
              <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/40">
                ESC
              </kbd>
            </div>

            <div className="max-h-[46vh] overflow-y-auto p-2">
              {matches.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-white/30">
                  <Terminal size={22} />
                  <p className="text-sm">
                    {query
                      ? "No matching commands"
                      : "Type a command to begin"}
                  </p>
                </div>
              ) : (
                matches.map((m, i) => (
                  <button
                    key={`${m.actionId}-${i}`}
                    onClick={() => run(m)}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors",
                      i === selected ? "bg-accent/[0.12]" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          i === selected
                            ? "bg-accent/20 text-accent"
                            : "bg-white/[0.05] text-white/50",
                        )}
                      >
                        <Terminal size={15} />
                      </span>
                      <span className="text-sm text-white/85">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ConfidenceMeter value={m.confidence} />
                      {i === selected && (
                        <CornerDownLeft size={14} className="text-white/40" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5 text-[11px] text-white/30">
              <span>Local command engine</span>
              <span className="flex gap-3">
                <span>↑↓ navigate</span>
                <span>↵ run</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  return (
    <div className="hidden items-center gap-1 sm:flex" title={`Confidence ${Math.round(value * 100)}%`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1 w-3 rounded-full",
            value > i / 3 ? "bg-accent/70" : "bg-white/10",
          )}
        />
      ))}
    </div>
  );
}
