import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AppWindow,
  Compass,
  CornerDownLeft,
  Gamepad2,
  History,
  MonitorCog,
  Play,
  Settings2,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useNavigationStore } from "@/state/navigationStore";
import { useConfirmStore } from "@/state/confirmStore";
import { useRecentCommandsStore } from "@/state/recentCommandsStore";
import { getProviders } from "@/providers";
import { actionRegistry } from "@/core/actions/registry";
import type { AssistantMatch, MatchGroup } from "@/providers/assistant/AssistantProvider";
import { useInsights } from "@/hooks/useInsights";
import { cn } from "@/lib/utils";

const GROUP_ICON: Record<MatchGroup, LucideIcon> = {
  navigate: Compass,
  app: AppWindow,
  game: Gamepad2,
  mode: Zap,
  system: MonitorCog,
  media: Play,
  settings: Settings2,
};

const GROUP_LABEL: Record<MatchGroup, string> = {
  navigate: "Navigate",
  app: "Application",
  game: "Game",
  mode: "Mode",
  system: "System",
  media: "Media",
  settings: "Settings",
};

const SUGGESTIONS: AssistantMatch[] = [
  { actionId: "navigate", args: { screen: "gaming" }, confidence: 1, label: "Open Gaming", group: "navigate" },
  { actionId: "enter-mode", args: { mode: "gaming" }, confidence: 1, label: "Enter Gaming Mode", group: "mode" },
  { actionId: "system-query", args: { metric: "cpu" }, confidence: 1, label: "CPU status", group: "system" },
  { actionId: "open-storage", args: {}, confidence: 1, label: "Show Storage", group: "system" },
  { actionId: "privacy-mode", args: {}, confidence: 1, label: "Activate Privacy Mode", group: "media" },
  { actionId: "open-settings", args: { section: "appearance" }, confidence: 1, label: "Settings · Appearance", group: "settings" },
];

/**
 * Global command palette (Ctrl+Space). Interprets natural-ish input via the
 * assistant provider into registered actions; shows recents + suggestions when
 * empty; enforces confirmation for gated actions.
 */
export function CommandPalette() {
  const open = useNavigationStore((s) => s.commandPaletteOpen);
  const close = useNavigationStore((s) => s.closeCommandPalette);
  const recents = useRecentCommandsStore((s) => s.recents);
  const record = useRecentCommandsStore((s) => s.record);
  const insights = useInsights();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly AssistantMatch[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const assistant = useMemo(() => getProviders().assistant, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setMatches([]);
      return;
    }
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

  const idle = !query.trim();
  const items: AssistantMatch[] = idle
    ? [
        ...recents.map((r) => ({ ...r, confidence: 1 })),
        ...SUGGESTIONS.filter((s) => !recents.some((r) => r.actionId === s.actionId && JSON.stringify(r.args) === JSON.stringify(s.args))),
      ].slice(0, 8)
    : [...matches];

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`) ?? null;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const run = (match: AssistantMatch) => {
    const def = actionRegistry.get(match.actionId);
    close();
    if (!def) return;
    record(match);
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
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Tab" && items[selected]) {
      e.preventDefault();
      setQuery(items[selected]!.label);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = items[selected];
      if (m) run(m);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const topInsight = insights[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div className="absolute inset-0 bg-void-950/55 backdrop-blur-md" onClick={close} />
          <motion.div
            initial={{ scale: 0.98, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.985, y: -6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.6 }}
            className="relative w-full max-w-2xl"
          >
            <div className="hairline-t absolute -top-px left-8 right-8" />
            <div className="glass-strong overflow-hidden rounded-2xl shadow-panel">
              <div className="flex items-center gap-3 px-5">
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  className="text-accent"
                >
                  <Sparkles size={18} />
                </motion.span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask NEXUS…"
                  spellCheck={false}
                  className="h-[60px] flex-1 bg-transparent text-[17px] text-white/95 placeholder:text-white/25 focus:outline-none"
                />
                <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35">ESC</kbd>
              </div>

              <div className="hairline-t mx-4" />

              <div ref={listRef} className="max-h-[48vh] overflow-y-auto p-2">
                {idle && (
                  <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-2 text-[10px] uppercase tracking-wide2 text-white/30">
                    {recents.length > 0 ? <><History size={11} /> Recent & suggested</> : "Suggested"}
                  </p>
                )}
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-white/30">
                    <p className="text-sm">No matching commands</p>
                    <p className="text-xs text-white/20">Try “gaming”, “cpu”, “open discord”, “focus mode”</p>
                  </div>
                ) : (
                  items.map((m, i) => {
                    const Icon = GROUP_ICON[m.group];
                    const active = i === selected;
                    return (
                      <button
                        key={`${m.actionId}-${JSON.stringify(m.args)}-${i}`}
                        data-index={i}
                        onClick={() => run(m)}
                        onMouseEnter={() => setSelected(i)}
                        className={cn(
                          "group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors duration-100",
                          active ? "bg-accent/[0.12]" : "hover:bg-white/[0.03]",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                              active ? "bg-accent/20 text-accent" : "bg-white/[0.04] text-white/45",
                            )}
                          >
                            <Icon size={15} />
                          </span>
                          <div className="min-w-0">
                            <p className={cn("truncate text-[15px]", active ? "text-white" : "text-white/85")}>{m.label}</p>
                            <p className="truncate text-[11px] text-white/35">
                              {GROUP_LABEL[m.group]}
                              {m.hint ? ` · ${m.hint}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 pl-3">
                          {!idle && <ConfidenceMeter value={m.confidence} />}
                          <CornerDownLeft size={14} className={cn("transition-opacity", active ? "text-white/50" : "opacity-0")} />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-5 py-2.5 text-[11px] text-white/35">
                <span className="truncate">
                  {topInsight ? <span className="text-white/50">{topInsight.text}</span> : "Local command engine · deterministic"}
                </span>
                <span className="flex shrink-0 gap-3">
                  <span>↑↓</span>
                  <span>⇥ complete</span>
                  <span>↵ run</span>
                </span>
              </div>
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
        <span key={i} className={cn("h-1 w-3 rounded-full", value > (i + 0.5) / 3.2 ? "bg-accent/70" : "bg-white/10")} />
      ))}
    </div>
  );
}
