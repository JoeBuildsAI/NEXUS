import { Paperclip, Star } from "lucide-react";
import type { EmailAccount } from "@/core/types";
import type { ThreadRow } from "@/hooks/useInbox";
import { CATEGORY_LABEL } from "@/core/email/classify";
import { VirtualList } from "@/components/ui/VirtualList";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  rows: readonly ThreadRow[];
  selectedId: string | null;
  onSelect: (row: ThreadRow) => void;
  accounts: readonly EmailAccount[];
  showAccount: boolean;
  onEndReached?: () => void;
  footer?: React.ReactNode;
  scrollToIndex?: number | null;
}

export const ROW_HEIGHT = 64;

/** Virtualized thread list: unread dot, sender, subject, category, account, time. No cards. */
export function MessageList({ rows, selectedId, onSelect, accounts, showAccount, onEndReached, footer, scrollToIndex }: Props) {
  const labelOf = (id: string) => { const a = accounts.find((x) => x.id === id); return a?.label ?? a?.displayName ?? ""; };
  return (
    <VirtualList
      items={rows}
      rowHeight={ROW_HEIGHT}
      keyOf={(r) => r.head.id}
      className="h-full"
      onEndReached={onEndReached}
      scrollToIndex={scrollToIndex}
      footer={footer}
      render={(row) => {
        const m = row.head;
        const active = m.id === selectedId;
        return (
          <button
            onClick={() => onSelect(row)}
            data-message-row
            className={cn("group relative flex h-full w-full items-start gap-4 px-3 text-left transition-colors", active ? "bg-white/[0.045]" : "hover:bg-white/[0.02]")}
          >
            <span className={cn("mt-[22px] h-1.5 w-1.5 shrink-0 rounded-full", row.unread ? "bg-white" : "bg-transparent")} />
            <span className="flex min-w-0 flex-1 flex-col justify-center py-2.5">
              <span className="flex items-baseline gap-3">
                <span className={cn("truncate text-[13.5px]", row.unread ? "font-medium text-white" : "text-white/70")}>{m.sender.trim() || m.senderAddress || "Unknown sender"}</span>
                {row.count > 1 && <span className="shrink-0 font-mono text-[10.5px] tabular text-white/35">{row.count}</span>}
                <span className="ml-auto shrink-0 font-mono text-[10.5px] tabular text-white/35">{formatRelativeTime(m.timestamp)}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className={cn("truncate text-[13px]", row.unread ? "text-white/85" : "text-white/50")}>{m.subject}</span>
                {m.hasAttachments && <Paperclip size={10} className="shrink-0 text-white/30" />}
                {m.starred && <Star size={10} className="shrink-0 fill-white/60 text-white/60" />}
              </span>
              <span className="mt-1 flex items-center gap-2 text-micro text-white/30">
                <span>{CATEGORY_LABEL[m.category]}</span>
                {showAccount && labelOf(m.accountId) && <><span className="text-white/15">·</span><span>{labelOf(m.accountId)}</span></>}
              </span>
            </span>
            <span className={cn("absolute inset-y-2 left-0 w-px", active ? "bg-white/70" : "bg-transparent")} />
          </button>
        );
      }}
    />
  );
}
