import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

interface Props {
  items: readonly (ContextMenuItem | "separator")[];
  children: ReactNode;
  className?: string;
}

/**
 * NEXUS-native context menu. Wrap a region; right-click opens a minimal
 * typographic menu clamped to the viewport. Escape / outside click closes.
 */
export function ContextMenu({ items, children, className }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      const actionable = items.filter((i): i is ContextMenuItem => i !== "separator" && !i.disabled);
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, actionable.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); actionable[selected]?.onSelect(); close(); }
    };
    window.addEventListener("pointerdown", close, { capture: true });
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("blur", close);
    };
  }, [pos, items, selected]);

  // Clamp to viewport once mounted.
  useEffect(() => {
    if (!pos || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const x = Math.min(pos.x, window.innerWidth - r.width - 8);
    const y = Math.min(pos.y, window.innerHeight - r.height - 8);
    if (x !== pos.x || y !== pos.y) setPos({ x, y });
  }, [pos]);

  const actionable = items.filter((i): i is ContextMenuItem => i !== "separator" && !i.disabled);

  return (
    <div
      className={className}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelected(0);
        setPos({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
      <AnimatePresence>
        {pos && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.98, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            onPointerDown={(e) => e.stopPropagation()}
            className="glass-strong fixed z-[500] min-w-[200px] rounded-md py-1.5 text-sm"
            style={{ left: pos.x, top: pos.y }}
          >
            {items.map((item, i) =>
              item === "separator" ? (
                <div key={`sep-${i}`} className="my-1.5 h-px bg-white/[0.06]" />
              ) : (
                <button
                  key={item.id}
                  role="menuitem"
                  disabled={item.disabled}
                  onMouseEnter={() => setSelected(actionable.indexOf(item))}
                  onClick={() => { item.onSelect(); setPos(null); }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-1.5 text-left transition-colors",
                    item.disabled ? "text-white/25" : item.danger ? "text-status-critical/85" : "text-white/80",
                    !item.disabled && actionable[selected] === item && "bg-white/[0.07] text-white",
                  )}
                >
                  {item.icon && <span className="w-4 text-white/45">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
