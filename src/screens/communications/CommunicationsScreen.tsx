import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import type { Message, MessageCategory } from "@/core/types";
import { MessageList } from "./MessageList";
import { MessageDetail } from "./MessageDetail";
import { InboxSummaryPanel } from "./InboxSummaryPanel";
import { Tabs, type TabItem } from "@/components/ui";

type Filter = "all" | "unread" | "important" | "newsletter" | "subscription";

const TABS: TabItem<Filter>[] = [
  { id: "all", label: "Unified Inbox" },
  { id: "unread", label: "Unread" },
  { id: "important", label: "Priority" },
  { id: "newsletter", label: "Newsletters" },
  { id: "subscription", label: "Subscriptions" },
];

export function CommunicationsScreen() {
  const provider = useMemo(() => getProviders().email, []);
  const { data, loading, reload } = useAsync(() => provider.getMessages(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const messages = useMemo(() => {
    const all = [...(data ?? [])].sort((a, b) => b.timestamp - a.timestamp);
    if (filter === "all") return all;
    if (filter === "unread") return all.filter((m) => !m.read);
    return all.filter((m) => m.category === (filter as MessageCategory));
  }, [data, filter]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const act = async (fn: () => Promise<void>) => {
    await fn();
    reload();
  };

  const onSelect = (m: Message) => {
    setSelectedId(m.id);
    if (!m.read) void act(() => provider.markRead(m.id, true));
  };

  return (
    <ScreenShell
      title="Communications"
      subtitle="Unified inbox across your accounts"
      actions={<Tabs tabs={TABS} value={filter} onChange={setFilter} />}
    >
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex min-h-0 flex-col gap-4">
          <InboxSummaryPanel />
          <div className="min-h-0 flex-1">
            {loading ? (
              <p className="text-sm text-white/30">Loading messages…</p>
            ) : messages.length === 0 ? (
              <EmptyInbox />
            ) : (
              <MessageList
                messages={messages}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            )}
          </div>
        </div>

        <MessageDetail
          message={selected}
          onMarkUnread={(m) => act(() => provider.markRead(m.id, false))}
          onArchive={(m) => {
            setSelectedId(null);
            void act(() => provider.archive(m.id));
          }}
          onDelete={(m) => {
            setSelectedId(null);
            void act(() => provider.delete(m.id));
          }}
          onUnsubscribe={(m) => {
            setSelectedId(null);
            void act(() => provider.unsubscribe(m.id));
          }}
        />
      </div>
    </ScreenShell>
  );
}

function EmptyInbox() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
      <Inbox size={28} />
      <p className="text-sm">Nothing here</p>
    </div>
  );
}
