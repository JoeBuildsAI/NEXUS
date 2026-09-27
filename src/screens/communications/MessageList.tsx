import type { Message } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  messages: readonly Message[];
  selectedId: string | null;
  onSelect: (m: Message) => void;
}

/** Sender · subject · preview · time. Unread is obvious but quiet. */
export function MessageList({ messages, selectedId, onSelect }: Props) {
  return (
    <div className="divide-y divide-white/[0.05]" role="list">
      {messages.map((m) => {
        const active = selectedId === m.id;
        return (
          <button
            key={m.id}
            role="listitem"
            onClick={() => onSelect(m)}
            className={cn("group relative grid w-full grid-cols-[10px_1fr_auto] items-baseline gap-4 py-3.5 pl-1 pr-3 text-left transition-colors", active ? "bg-white/[0.035]" : "hover:bg-white/[0.02]")}
          >
            <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full", m.read ? "bg-transparent" : m.category === "important" ? "bg-white" : "bg-white/40")} />
            <span className="min-w-0">
              <span className="flex items-baseline gap-3">
                <span className={cn("truncate text-[14px]", m.read ? "text-white/55" : "text-white/95")}>{m.sender}</span>
                {m.category === "important" && !m.read && <span className="shrink-0 text-micro text-white/40">attention</span>}
              </span>
              <span className={cn("mt-0.5 block truncate text-[13.5px]", m.read ? "text-white/40" : "text-white/75")}>{m.subject}</span>
              <span className="mt-0.5 block truncate text-[12px] text-white/28">{m.preview}</span>
            </span>
            <span className="font-mono text-[11px] tabular text-white/30">{formatRelativeTime(m.timestamp)}</span>
            {active && <span className="absolute inset-y-3 left-[-12px] w-px bg-white" />}
          </button>
        );
      })}
    </div>
  );
}
