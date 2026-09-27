import { useEffect, useMemo, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useDevStore } from "@/state/devStore";
import { useNavigationStore } from "@/state/navigationStore";
import type { EmailAccount, Message, MessageCategory } from "@/core/types";
import { isOffline } from "@/core/errors";
import { MessageList } from "./MessageList";
import { MessageDetail } from "./MessageDetail";
import { InboxSummaryPanel } from "./InboxSummaryPanel";
import { SubscriptionsPanel } from "./SubscriptionsPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, type TabItem, Button } from "@/components/ui";
import { notify } from "@/state/toastStore";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | "important" | "newsletter" | "receipt" | "subscriptions";

const TABS: TabItem<Filter>[] = [
  { id: "all", label: "Inbox" },
  { id: "unread", label: "Unread" },
  { id: "important", label: "Priority" },
  { id: "newsletter", label: "Newsletters" },
  { id: "receipt", label: "Receipts" },
  { id: "subscriptions", label: "Subscriptions" },
];

export function CommunicationsScreen() {
  const provider = useMemo(() => getProviders().email, []);
  const emailConnected = useDevStore((s) => s.emailConnected);
  const emailPulse = useDevStore((s) => s.emailPulse);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const { data, loading, error, reload } = useAsync(() => provider.getMessages(), [emailConnected, emailPulse]);
  const { data: accounts } = useAsync<readonly EmailAccount[]>(() => provider.getAccounts(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [account, setAccount] = useState<string | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const messages = useMemo(() => {
    let all = [...(data ?? [])].sort((a, b) => b.timestamp - a.timestamp);
    if (account !== "all") all = all.filter((m) => m.accountId === account);
    if (filter === "unread") all = all.filter((m) => !m.read);
    else if (filter !== "all" && filter !== "subscriptions") all = all.filter((m) => m.category === (filter as MessageCategory));
    return all;
  }, [data, filter, account]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);

  const act = async (fn: () => Promise<void>, toast?: string) => { await fn(); if (toast) notify.neutral(toast); reload(); };
  const onSelect = (m: Message) => { setSelectedId(m.id); if (!m.read) void act(() => provider.markRead(m.id, true)); };
  const unread = (data ?? []).filter((m) => !m.read).length;

  if (error && isOffline(error)) {
    return <EmptyState eyebrow="Communications" title="Offline" body="Connect an account when you're ready. NEXUS uses a mock inbox on this machine." action={<Button variant="outline" size="sm" onClick={() => { navigate("settings"); setSection("integrations"); }}>Integrations</Button>} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1880px] flex-wrap items-end justify-between gap-6 px-12 pb-8 pt-10 2xl:px-16">
        <div className="flex items-end gap-10">
          <div>
            <p className="text-micro tracking-cinematic text-white/35">Communications</p>
            <h1 className="mt-3 font-sans text-display-lg font-semibold tabular tracking-tight text-white">{unread}<span className="ml-3 font-sans text-base font-normal text-white/40">unread</span></h1>
          </div>
          <Tabs tabs={TABS} value={filter} onChange={setFilter} className="pb-2" />
        </div>
        {accounts && accounts.length > 1 && (
          <div className="flex gap-5 pb-2 text-[12.5px]">
            <button onClick={() => setAccount("all")} className={cn("transition-colors", account === "all" ? "text-white" : "text-white/35 hover:text-white/70")}>All accounts</button>
            {accounts.map((a) => <button key={a.id} onClick={() => setAccount(a.id)} title={a.address} className={cn("transition-colors", account === a.id ? "text-white" : "text-white/35 hover:text-white/70")}>{a.displayName}</button>)}
          </div>
        )}
      </div>

      <div className="mx-auto min-h-0 w-full max-w-[1880px] flex-1 overflow-y-auto px-12 pb-16 2xl:px-16">
        {filter === "subscriptions" ? (
          <SubscriptionsPanel />
        ) : (
          <div className="grid grid-cols-1 gap-x-20 gap-y-10 lg:grid-cols-[minmax(380px,0.9fr)_1.3fr]">
            <div className="space-y-10">
              <InboxSummaryPanel />
              <div>
                <div className="rule mb-1" />
                {loading && !data ? (
                  <div className="space-y-2 pt-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-sm bg-white/[0.015]" />)}</div>
                ) : messages.length === 0 ? (
                  <p className="py-16 text-center text-micro text-white/30">Nothing here</p>
                ) : (
                  <MessageList messages={messages} selectedId={selectedId} onSelect={onSelect} />
                )}
              </div>
            </div>
            <div className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-220px)]">
              <MessageDetail
                message={selected}
                onMarkUnread={(m) => act(() => provider.markRead(m.id, false), "Marked unread")}
                onArchive={(m) => { setSelectedId(null); void act(() => provider.archive(m.id), "Archived"); }}
                onDelete={(m) => { setSelectedId(null); void act(() => provider.delete(m.id), "Deleted"); }}
                onUnsubscribe={(m) => { setSelectedId(null); void act(() => provider.unsubscribe(m.id), `Unsubscribed · ${m.sender}`); }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
