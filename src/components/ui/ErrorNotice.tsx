import { useState } from "react";
import { Button } from "./Button";
import { sanitizeErrorMessage } from "./ErrorBoundary";

/**
 * Controlled failure state for a screen region that could not load.
 * Never shows stacks, JSON or raw native errors — details are sanitized and
 * opt-in. ("ACTION FAILED · NEXUS couldn't complete this action.")
 */
export function ErrorNotice({ title = "Couldn't load", body, error, onRetry }: { title?: string; body: string; error?: unknown; onRetry?: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const details = error ? sanitizeErrorMessage(error) : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-l border-white/20 py-2 pl-5">
      <span className="text-micro tracking-cinematic text-status-attention/80">{title}</span>
      <span className="text-[13.5px] text-white/60">{body}</span>
      <span className="flex items-center gap-3">
        {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Try again</Button>}
        {details && <button onClick={() => setShowDetails((v) => !v)} className="text-[12.5px] text-white/35 transition-colors hover:text-white">{showDetails ? "Hide details" : "Details"}</button>}
      </span>
      {showDetails && details && <span className="basis-full font-mono text-[11.5px] text-white/40" data-selectable="true">{details}</span>}
    </div>
  );
}
