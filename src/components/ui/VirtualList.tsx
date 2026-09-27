import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props<T> {
  items: readonly T[];
  rowHeight: number;
  render: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => string;
  className?: string;
  /** Rows rendered beyond the viewport on each side. */
  overscan?: number;
  /** Called when the user scrolls near the end (incremental loading). */
  onEndReached?: () => void;
  /** Keep this index visible (keyboard navigation). */
  scrollToIndex?: number | null;
  footer?: ReactNode;
}

/** Fixed-row-height windowed list. Renders only visible rows; safe for 100k items. */
export function VirtualList<T>({ items, rowHeight, render, keyOf, className, overscan = 6, onEndReached, scrollToIndex, footer }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const endFired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setHeight(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollToIndex == null || !ref.current) return;
    const top = scrollToIndex * rowHeight;
    const el = ref.current;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight;
  }, [scrollToIndex, rowHeight]);

  const total = items.length * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  return (
    <div
      ref={ref}
      className={cn("relative min-h-0 overflow-y-auto", className)}
      onScroll={(e) => {
        const el = e.currentTarget;
        setScrollTop(el.scrollTop);
        const nearEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - rowHeight * 8;
        if (nearEnd && !endFired.current) { endFired.current = true; onEndReached?.(); }
        if (!nearEnd) endFired.current = false;
      }}
    >
      <div style={{ height: total, position: "relative" }}>
        {items.slice(start, end).map((item, i) => (
          <div key={keyOf(item, start + i)} style={{ position: "absolute", top: (start + i) * rowHeight, height: rowHeight, left: 0, right: 0 }}>
            {render(item, start + i)}
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}
