import type { ReactNode } from "react";

/** Intentional empty state: eyebrow, quiet headline, one line, optional action. */
export function EmptyState({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center px-12">
      <div className="max-w-md">
        <p className="text-micro tracking-cinematic text-white/35">{eyebrow}</p>
        <p className="mt-3 font-display text-display-md font-semibold uppercase tracking-wide text-white/85">{title}</p>
        <p className="mt-4 text-[14px] leading-relaxed text-white/40">{body}</p>
        {action && <div className="mt-8">{action}</div>}
      </div>
    </div>
  );
}
