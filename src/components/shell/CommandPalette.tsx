import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigationStore } from "@/state/navigationStore";
import { useConfirmStore } from "@/state/confirmStore";
import { useRecentCommandsStore } from "@/state/recentCommandsStore";
import { getProviders } from "@/providers";
import { actionRegistry } from "@/core/actions/registry";
import type { AssistantMatch, MatchGroup } from "@/providers/assistant/AssistantProvider";
import { useInsights } from "@/hooks/useInsights";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<MatchGroup, string> = {
  navigate: "Open",
  app: "App",
  game: "Game",
  mode: "Action",
  system: "System",
  media: "Media",
  settings: "Settings",
};

const SUGGESTIONS: AssistantMatch[] = [
  { actionId: "navigate", args: { screen: "gaming" }, confidence: 1, label: "Gaming", group: "navigate" },
  { actionId: "enter-mode", args: { mode: "gaming" }, confidence: 1, label: "Enter Gaming Mode", group: "mode" },
  { actionId: "system-query", args: { metric: "cpu" }, confidence: 1, label: "CPU status", group: "system" },
  { actionId: "open-storage", args: {}, confidence: 1, label: "Storage analysis", group: "system" },
  { actionId: "privacy-mode", args: {}, confidence: 1, label: "Privacy mode", group: "media" },
  { actionId: "open-settings", args: { section: "appearance" }, confidence: 1, label: "Appearance", group: "settings" },
];

/**
 * Ctrl+Space. The environment recedes; a single large prompt appears with
 * typographic results. No frame, no chrome — just intent and answers.
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
    ? [...recents.map((r) => ({ ...r, confidence: 1 })), ...SUGGESTIONS.filter((s) => !recents.some((r) => r.actionId === s.actionId && JSON.stringify(r.args) === JSON.stringify(s.args)))].slice(0, 7)
    : [...matches];

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const run = (match: AssistantMatch) => {
    const def = actionRegistry.get(match.actionId);
    close();
    if (!def) return;
    record(match);
    if (def.requiresConfirmation) {
      useConfirmStore.getState().confirm({ title: def.title, message: def.description, danger: true, onConfirm: () => void actionRegistry.execute(match.actionId, { args: match.args }, true) });
    } else void actionRegistry.execute(match.actionId, { args: match.args });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Tab" && items[selected]) { e.preventDefault(); setQuery(items[selected]!.label); }
    else if (e.key === "Enter") { e.preventDefault(); const m = items[selected]; if (m) run(m); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  const topInsight = insights[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[150]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
          {/* Environment recedes */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-xl" onClick={close} />

          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 560, damping: 40, mass: 0.5 }}
            className="relative mx-auto mt-[18vh] w-full max-w-[720px] px-8"
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-baseline gap-4">
              <span className="font-display text-display-md font-light text-white/30">›</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="What do you want to do?"
                spellCheck={false}
                aria-label="Command"
                className="h-16 w-full bg-transparent font-display text-display-md font-light tracking-wide text-white placeholder:text-white/25 focus:outline-none"
              />
            </div>
            <div className="mt-2 h-px bg-gradient-to-r from-white/25 via-white/10 to-transparent" />

            <div ref={listRef} className="mt-6 max-h-[48vh] overflow-y-auto pr-2" role="listbox">
              {items.length === 0 ? (
                <p className="py-8 text-sm text-white/30">No matching commands. Try “gaming”, “cpu”, “open discord”, “focus mode”.</p>
              ) : (
                items.map((m, i) => {
                  const active = i === selected;
                  return (
                    <button
                      key={`${m.actionId}-${JSON.stringify(m.args)}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={active}
                      onClick={() => run(m)}
                      onMouseEnter={() => setSelected(i)}
                      className="group relative flex w-full items-baseline gap-6 py-2.5 text-left"
                    >
                      <span className={cn("w-[72px] shrink-0 text-micro transition-colors", active ? "text-white/60" : "text-white/25")}>{GROUP_LABEL[m.group]}</span>
                      <span className={cn("flex-1 truncate font-display text-[19px] tracking-wide transition-colors duration-150", active ? "text-white" : "text-white/55 group-hover:text-white/80")}>{m.label}</span>
                      {m.hint && <span className={cn("shrink-0 text-xs transition-colors", active ? "text-white/45" : "text-white/20")}>{m.hint}</span>}
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex items-center justify-between text-micro text-white/25">
              <span className="truncate normal-case tracking-normal">{topInsight ? topInsight.text : idle && recents.length ? "Recent and suggested" : "Local command engine"}</span>
              <span className="flex shrink-0 gap-4 normal-case tracking-normal"><span>↑↓</span><span>tab</span><span>enter</span><span>esc</span></span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
