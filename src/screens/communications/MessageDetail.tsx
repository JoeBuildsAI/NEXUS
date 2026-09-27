import type { Message } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";

interface Props {
  message: Message | null;
  onMarkUnread: (m: Message) => void;
  onArchive: (m: Message) => void;
  onDelete: (m: Message) => void;
  onUnsubscribe: (m: Message) => void;
}

/** Reading pane. Editorial: subject as headline, sender line, quiet actions. */
export function MessageDetail({ message, onMarkUnread, onArchive, onDelete, onUnsubscribe }: Props) {
  if (!message) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <p className="text-micro tracking-cinematic text-white/25">Select a message</p>
      </div>
    );
  }

  return (
    <article className="flex h-full flex-col">
      <header>
        <p className="text-micro text-white/35">{message.category} · {formatRelativeTime(message.timestamp)}</p>
        <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white" data-selectable="true">{message.subject}</h2>
        <p className="mt-3 text-[14px] text-white/60"><span className="text-white/85">{message.sender}</span> <span className="text-white/30" data-selectable="true">{message.senderAddress}</span></p>
      </header>

      <div className="mt-6 flex items-center gap-6 text-[12.5px]">
        <Act onClick={() => onMarkUnread(message)}>Mark unread</Act>
        <Act onClick={() => onArchive(message)}>Archive</Act>
        {message.canUnsubscribe && <Act onClick={() => onUnsubscribe(message)}>Unsubscribe</Act>}
        <Act onClick={() => onDelete(message)} danger className="ml-auto">Delete</Act>
      </div>
      <div className="rule mt-4" />

      <div className="mt-8 max-w-2xl flex-1 overflow-y-auto text-[15px] leading-[1.7] text-white/70" data-selectable="true">
        {message.body.split("\n").map((line, i) => <p key={i} className="min-h-[1.2em]">{line}</p>)}
      </div>
    </article>
  );
}

function Act({ children, onClick, danger, className }: { children: React.ReactNode; onClick: () => void; danger?: boolean; className?: string }) {
  return (
    <button onClick={onClick} className={`transition-colors ${danger ? "text-white/35 hover:text-status-critical" : "text-white/50 hover:text-white"} ${className ?? ""}`}>
      {children}
    </button>
  );
}
