import type { Message, MessageCategory } from "@/core/types";
import { Panel } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const CATEGORY_DOT: Record<MessageCategory, string> = {
  important: "bg-status-attention",
  newsletter: "bg-accent/60",
  subscription: "bg-[#9f8cff]",
  receipt: "bg-status-nominal",
  social: "bg-[#e6a15e]",
  other: "bg-white/30",
};

interface Props {
  messages: readonly Message[];
  selectedId: string | null;
  onSelect: (m: Message) => void;
}

export function MessageList({ messages, selectedId, onSelect }: Props) {
  return (
    <Panel className="h-full overflow-hidden">
      <div className="h-full divide-y divide-white/[0.03] overflow-y-auto">
        {messages.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={cn(
              "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
              selectedId === m.id ? "bg-accent/[0.08]" : "hover:bg-white/[0.02]",
            )}
          >
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                m.read ? "bg-transparent" : CATEGORY_DOT[m.category],
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    m.read ? "text-white/55" : "font-medium text-white/90",
                  )}
                >
                  {m.sender}
                </span>
                <span className="shrink-0 text-[11px] text-white/30">
                  {formatRelativeTime(m.timestamp)}
                </span>
              </div>
              <p
                className={cn(
                  "truncate text-[13px]",
                  m.read ? "text-white/45" : "text-white/75",
                )}
              >
                {m.subject}
              </p>
              <p className="truncate text-xs text-white/30">{m.preview}</p>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}
