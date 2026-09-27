import { useEffect, useMemo, useState } from "react";
import { Inbox, Unplug } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
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

  const act = async (fn: () => Promise<void>, toast?: string) => {
    await fn();
    if (toast) notify.neutral(toast);
    reload();
  };
  const onSelect = (m: Message) => {
    setSelectedId(m.id);
    if (!m.read) void act(() => provider.markRead(m.id, true));
  };

  const unread = (data ?? []).filter((m) => !m.read).length;

  const accountFilter = accounts && accounts.length > 1 && (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
      <button onClick={() => setAccount("all")} className={cn("rounded-md px-2.5 py-1 text-xs", account === "all" ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80")}>All accounts</button>
      {accounts.map((a) => (
        <button key={a.id} onClick={() => setAccount(a.id)} title={a.address} className={cn("rounded-md px-2.5 py-1 text-xs", account === a.id ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80")}>{a.displayName}</button>
      ))}
    </div>
  );

  if (error && isOffline(error)) {
    return (
      <ScreenShell eyebrow="Unified" title="Communications">
        <div className="flex min-h-[50vh] items-center justify-center text-center">
          <div className="max-w-md">
            <Unplug size={28} className="mx-auto text-white/30" />
            <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">EMAIL DISCONNECTED</p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">No mail account is reachable. NEXUS will use the mock inbox on this machine; connect Gmail or Outlook in Integrations later.</p>
            <Button variant="outline" className="mt-6" onClick={() => { navigate("settings"); setSection("integrations"); }}>Open Integrations</Button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      eyebrow="Unified"
      title="Communications"
      subtitle={`${unread} unread across ${accounts?.length ?? 1} account${(accounts?.length ?? 1) === 1 ? "" : "s"}`}
      wide
      actions={<div className="flex flex-wrap items-center gap-2">{accountFilter}<Tabs tabs={TABS} value={filter} onChange={setFilter} /></div>}
    >
      {filter === "subscriptions" ? (
        <SubscriptionsPanel />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(360px,1fr)_1.4fr]">
          <div className="flex min-h-0 flex-col gap-6">
            <InboxSummaryPanel />
            <div className="min-h-[50vh]">
              {loading && !data ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.02]" />)}</div>
              ) : messages.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-white/30">
                  <Inbox size={26} />
                  <p className="text-sm">Nothing here</p>
                </div>
              ) : (
                <MessageList messages={messages} selectedId={selectedId} onSelect={onSelect} />
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-0 lg:h-[calc(100vh-200px)]">
            <MessageDetail
              message={selected}
              onMarkUnread={(m) => act(() => provider.markRead(m.id, false), "Marked unread")}
              onArchive={(m) => { setSelectedId(null); void act(() => provider.archive(m.id), "Archived"); }}
              onDelete={(m) => { setSelectedId(null); void act(() => provider.delete(m.id), "Deleted"); }}
              onUnsubscribe={(m) => { setSelectedId(null); void act(() => provider.unsubscribe(m.id), `Unsubscribed from ${m.sender}`); }}
            />
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
