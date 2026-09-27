import { Archive, MailOpen, Trash2, BellOff, Mail } from "lucide-react";
import type { Message } from "@/core/types";
import { Panel, Button, Badge } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";

interface Props {
  message: Message | null;
  onMarkUnread: (m: Message) => void;
  onArchive: (m: Message) => void;
  onDelete: (m: Message) => void;
  onUnsubscribe: (m: Message) => void;
}

export function MessageDetail({
  message,
  onMarkUnread,
  onArchive,
  onDelete,
  onUnsubscribe,
}: Props) {
  if (!message) {
    return (
      <Panel className="flex h-full flex-col items-center justify-center gap-2 text-white/25">
        <Mail size={28} />
        <p className="text-sm">Select a message to read</p>
      </Panel>
    );
  }

  return (
    <Panel className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug text-white/95" data-selectable="true">
            {message.subject}
          </h2>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/50">
            <span className="text-white/80">{message.sender}</span>
            <span className="text-white/30">·</span>
            <span className="text-xs" data-selectable="true">{message.senderAddress}</span>
          </div>
          <p className="mt-1 text-xs text-white/30">
            {formatRelativeTime(message.timestamp)}
          </p>
        </div>
        <Badge tone="neutral" className="capitalize">
          {message.category}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
        <Button size="sm" variant="ghost" onClick={() => onMarkUnread(message)}>
          <MailOpen size={14} /> Mark unread
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onArchive(message)}>
          <Archive size={14} /> Archive
        </Button>
        {message.canUnsubscribe && (
          <Button size="sm" variant="ghost" onClick={() => onUnsubscribe(message)}>
            <BellOff size={14} /> Unsubscribe
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          className="ml-auto"
          onClick={() => onDelete(message)}
        >
          <Trash2 size={14} /> Delete
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-white/70"
        data-selectable="true"
      >
        {message.body.split("\n").map((line, i) => (
          <p key={i} className="min-h-[1.2em]">
            {line}
          </p>
        ))}
      </div>
    </Panel>
  );
}
