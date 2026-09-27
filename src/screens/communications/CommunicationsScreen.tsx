import { useEffect, useMemo, useState } from "react";
import { Filter, RefreshCw, Search, X } from "lucide-react";
import type { Message } from "@/core/types";
import { useInbox, type DateRange, type SortKey, type ThreadRow } from "@/hooks/useInbox";
import { useNavigationStore, type CommsSurface } from "@/state/navigationStore";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { isOffline } from "@/core/errors";
import type { InboxView } from "@/core/email/classify";
import { notify } from "@/state/toastStore";
import { requestConfirm } from "@/state/confirmStore";
import { activity } from "@/state/activityStore";
import { Button, ErrorNotice } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageList } from "./MessageList";
import { MessageDetail } from "./MessageDetail";
import { InboxHealthPanel } from "./InboxHealthPanel";
import { SubscriptionManager } from "./SubscriptionManager";
import { RulesPanel } from "./RulesPanel";
import { SummaryPanel } from "./SummaryPanel";
import { CleanupReview } from "./CleanupReview";
import type { EmailAutoProvider } from "@/providers/email/EmailAutoProvider";
import { cn } from "@/lib/utils";

const VIEWS: { id: InboxView; label: string }[] = [
  { id: "all", label: "All mail" }, { id: "important", label: "Important" }, { id: "people", label: "People" }, { id: "purchases", label: "Purchases" }, { id: "receipts", label: "Receipts" },
  { id: "travel", label: "Travel" }, { id: "financial", label: "Financial" }, { id: "subscriptions", label: "Subscriptions" }, { id: "newsletters", label: "Newsletters" },
  { id: "notifications", label: "Notifications" }, { id: "promotions", label: "Promotions" }, { id: "cleanup", label: "Cleanup" },
];
const SURFACES: { id: CommsSurface; label: string }[] = [{ id: "inbox", label: "Inbox" }, { id: "summary", label: "Digest" }, { id: "health", label: "Health" }, { id: "subscriptions", label: "Subscriptions" }, { id: "rules", label: "Rules" }];

/**
 * Communications: unified multi-account inbox with views and filters, a
 * reading pane, and four control surfaces (Today, Health, Subscriptions,
 * Rules). Calm, dense, no cards.
 */
export function CommunicationsScreen() {
  const inbox = useInbox();
  const { messages, accounts, error, loading, loadingMore, hasMore, loadMore, filters, setFilters, resetFilters, threads, unread, reload, mode, searchProvider, searching, searchResults, clearSearch } = inbox;
  const [surface, setSurface] = useState<CommsSurface>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [queryDraft, setQueryDraft] = useState("");
  const request = useNavigationStore((s) => s.commsRequest);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const rulesVersion = useEmailRulesStore((s) => s.rules.length);
  void rulesVersion;

  // Deep links from the command palette.
  useEffect(() => {
    if (!request) return;
    setSurface(request.surface);
    if (request.view) setFilters({ view: request.view as InboxView, sender: request.sender ?? null, query: request.query ?? "", accountId: request.accountId ?? "all" });
    else if (request.sender || request.query || request.accountId) setFilters({ sender: request.sender ?? null, query: request.query ?? "", accountId: request.accountId ?? "all" });
    if (request.query) setQueryDraft(request.query);
  }, [request?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const selected = selectedId ? byId.get(selectedId) ?? (searchResults ?? []).find((m) => m.id === selectedId) ?? null : null;
  const thread = useMemo(() => (selected?.threadId ? messages.filter((m) => m.threadId === selected.threadId && m.accountId === selected.accountId) : selected ? [selected] : []), [selected, messages]);
  const selectedAccount = selected ? accounts.find((a) => a.id === selected.accountId) ?? null : null;
  const showAccount = accounts.length > 1;

  // Keep selection valid; auto-select the first row when nothing is selected.
  useEffect(() => {
    if (selectedId && (byId.has(selectedId) || searchResults?.some((m) => m.id === selectedId))) return;
    setSelectedId(threads[0]?.head.id ?? null);
  }, [threads, byId, selectedId, searchResults]);

  const provider = inbox.provider;
  const act = async (fn: () => Promise<void>, toast?: string) => { await fn(); if (toast) notify.neutral(toast); await reload(); };
  const onSelect = (row: ThreadRow) => {
    setSelectedId(row.head.id);
    if (!row.head.read) void provider.markRead(row.head.id, true).then(() => reload());
  };
  const onDelete = (m: Message) => requestConfirm({ title: "Delete this message?", message: `“${m.subject.slice(0, 80)}” moves to your provider's trash.`, confirmLabel: "Delete", danger: true, onConfirm: () => act(() => provider.delete(m.id), "Deleted") });
  const oneClick = async (m: Message, url: string) => {
    const auto = provider as EmailAutoProvider;
    const p = auto.providerFor?.(m.accountId);
    const r = p ? await p.unsubscribeOneClick(url) : { ok: true, detail: "accepted (demo)" };
    if (r.ok) {
      useEmailRulesStore.getState().setRule({ kind: "address", value: m.senderAddress, category: "subscription" });
      activity.record("email-unsubscribed", "Unsubscribed from one sender (one-click)");
      notify.success("Unsubscribe request sent", "The sender acknowledged the one-click request. Future mail files under Subscriptions.");
    } else notify.warn("Unsubscribe not confirmed", r.detail);
    await reload();
  };

  // Keyboard: j/k move, Enter opens, e archive, # delete — only outside inputs.
  useEffect(() => {
    if (surface !== "inbox") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = threads.findIndex((r) => r.head.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") { const n = threads[Math.min(threads.length - 1, idx + 1)]; if (n) { onSelect(n); e.preventDefault(); } }
      else if (e.key === "k" || e.key === "ArrowUp") { const n = threads[Math.max(0, idx - 1)]; if (n) { onSelect(n); e.preventDefault(); } }
      else if (e.key === "e" && selected) { void act(() => provider.archive(selected.id), "Archived"); }
      else if (e.key === "u" && selected) { void act(() => provider.markRead(selected.id, false)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [threads, selectedId, selected, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  const offline = !!error && isOffline(error);
  const loadFailed = !!error && !offline;
  const noAccounts = mode === "none" && !loading && messages.length === 0;

  if (offline && messages.length === 0) {
    return <EmptyState eyebrow="Communications" title="Offline" body="The mail service is unreachable. Loaded messages return when the connection does." action={<Button variant="outline" size="sm" onClick={() => void reload()}>Retry</Button>} />;
  }
  if (noAccounts) {
    return <EmptyState eyebrow="Communications" title="No account connected" body="Connect Outlook or Gmail when you're ready. Until then this space stays quiet." action={<Button variant="outline" size="sm" onClick={() => { navigate("settings"); setSection("integrations"); }}>Connect an account</Button>} />;
  }

  const activeFilterCount = [filters.accountId !== "all", filters.unreadOnly, filters.attachmentsOnly, filters.starredOnly, !!filters.sender, filters.range !== "any", filters.sort !== "newest"].filter(Boolean).length;
  const selectedIndex = threads.findIndex((r) => r.head.id === selectedId);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mx-auto w-full max-w-[1880px] px-12 pt-6 2xl:px-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-micro tracking-cinematic text-white/35">
              Communications
              {mode === "demo" && <span className="ml-3 normal-case tracking-normal text-white/25">demo inbox</span>}
              {accounts.length > 0 && mode === "real" && <span className="ml-3 normal-case tracking-normal text-white/25">{accounts.length} account{accounts.length === 1 ? "" : "s"}</span>}
            </p>
            <h1 className="mt-3 font-sans text-display-lg font-semibold tabular tracking-tight text-white">{unread}<span className="ml-3 font-sans text-base font-normal text-white/40">unread</span></h1>
          </div>
          <div className="flex items-center gap-6 pb-2 text-[13px]">
            {SURFACES.map((s) => (
              <button key={s.id} onClick={() => setSurface(s.id)} className={cn("relative pb-1 transition-colors", surface === s.id ? "text-white" : "text-white/40 hover:text-white/75")}>
                {s.label}
                {surface === s.id && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
              </button>
            ))}
            <button onClick={() => void reload()} aria-label="Refresh" title="Refresh all accounts" className="text-white/35 transition-colors hover:text-white"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </div>

        {surface === "inbox" && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 pb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
              {VIEWS.map((v) => (
                <button key={v.id} onClick={() => setFilters({ view: v.id })} className={cn("relative pb-0.5 transition-colors", filters.view === v.id ? "text-white" : "text-white/40 hover:text-white/75", v.id === "cleanup" && "ml-2")}>
                  {v.label}
                  {filters.view === v.id && <span className="absolute inset-x-0 -bottom-px h-px bg-white/70" />}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-4">
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void searchProvider(queryDraft); }}>
                <Search size={12} className="text-white/30" />
                <input value={queryDraft} onChange={(e) => { setQueryDraft(e.target.value); setFilters({ query: e.target.value }); }} placeholder="Search · Enter searches the server" aria-label="Search mail" className="w-64 border-b border-white/10 bg-transparent py-1 text-[12.5px] text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none" />
                {(queryDraft || searchResults) && <button type="button" onClick={() => { setQueryDraft(""); setFilters({ query: "" }); clearSearch(); }} aria-label="Clear search" className="text-white/30 hover:text-white"><X size={12} /></button>}
              </form>
              <button onClick={() => setShowFilters((v) => !v)} className={cn("flex items-center gap-1.5 text-[12.5px] transition-colors", showFilters || activeFilterCount ? "text-white" : "text-white/40 hover:text-white/75")}><Filter size={12} /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
            </div>
          </div>
        )}
        {surface === "inbox" && showFilters && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-3 text-[12.5px]">
            <Sel label="Account" value={filters.accountId} onChange={(v) => setFilters({ accountId: v })} options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.label ?? a.displayName }))]} />
            <Sel label="Range" value={filters.range} onChange={(v) => setFilters({ range: v as DateRange })} options={[{ value: "any", label: "Any time" }, { value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} />
            <Sel label="Sort" value={filters.sort} onChange={(v) => setFilters({ sort: v as SortKey })} options={[{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "sender", label: "Sender" }, { value: "unread", label: "Unread first" }]} />
            <Tog on={filters.unreadOnly} onClick={() => setFilters({ unreadOnly: !filters.unreadOnly })}>Unread</Tog>
            <Tog on={filters.attachmentsOnly} onClick={() => setFilters({ attachmentsOnly: !filters.attachmentsOnly })}>Attachments</Tog>
            <Tog on={filters.starredOnly} onClick={() => setFilters({ starredOnly: !filters.starredOnly })}>Starred</Tog>
            {filters.sender && <Tog on onClick={() => setFilters({ sender: null })}>from {filters.sender} ×</Tog>}
            {activeFilterCount > 0 && <button onClick={resetFilters} className="text-white/35 hover:text-white">Reset</button>}
          </div>
        )}
        <div className="rule" />
      </div>

      {/* Body */}
      <div className="mx-auto min-h-0 w-full max-w-[1880px] flex-1 overflow-hidden px-12 pb-6 2xl:px-16">
        {loadFailed && <div className="my-6"><ErrorNotice title="Inbox unavailable" body="NEXUS couldn't read your messages." error={error} onRetry={() => void reload()} /></div>}
        {surface === "inbox" && filters.view === "cleanup" && (
          <div className="h-full overflow-y-auto pt-8"><CleanupReview messages={messages} accounts={accounts} onClose={() => setFilters({ view: "all" })} onChanged={() => void reload()} /></div>
        )}
        {surface === "inbox" && filters.view !== "cleanup" && (
          <div className="grid h-full grid-cols-1 gap-x-14 lg:grid-cols-[minmax(360px,0.85fr)_1.3fr]">
            <div className="flex min-h-0 flex-col">
              <p className="flex items-baseline justify-between py-2 text-micro text-white/30">
                <span>{searchResults ? `${threads.length} server result${threads.length === 1 ? "" : "s"}` : `${threads.length} conversation${threads.length === 1 ? "" : "s"} · ${messages.length.toLocaleString()} loaded`}</span>
                {searching && <span>searching…</span>}
              </p>
              {loading && messages.length === 0 ? (
                <div className="space-y-2 pt-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-sm bg-white/[0.015]" />)}</div>
              ) : threads.length === 0 ? (
                <p className="py-10 text-[13.5px] text-white/35">{filters.query || activeFilterCount ? "No messages match." : "Nothing here."}</p>
              ) : (
                <div className="min-h-0 flex-1">
                  <MessageList
                    rows={threads}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    accounts={accounts}
                    showAccount={showAccount}
                    onEndReached={() => { if (!searchResults && hasMore) void loadMore(); }}
                    scrollToIndex={selectedIndex >= 0 ? selectedIndex : null}
                    footer={!searchResults && (hasMore || loadingMore) ? <div className="py-4 text-center"><button onClick={() => void loadMore()} disabled={loadingMore} className="text-[12.5px] text-white/40 hover:text-white disabled:opacity-40">{loadingMore ? "Loading older…" : "Load older messages"}</button></div> : null}
                  />
                </div>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto pt-2">
              <MessageDetail message={selected} thread={thread} account={selectedAccount} onMarkUnread={(m) => act(() => provider.markRead(m.id, false))} onArchive={(m) => act(() => provider.archive(m.id), "Archived")} onDelete={onDelete} onRuleChanged={() => void reload()} onOneClickUnsubscribe={oneClick} />
            </div>
          </div>
        )}
        {surface === "summary" && <div className="h-full overflow-y-auto pt-10"><SummaryPanel messages={messages} onSelectView={(v) => { setSurface("inbox"); setFilters({ view: v, range: "today" }); }} /></div>}
        {surface === "health" && <div className="h-full overflow-y-auto pt-10"><InboxHealthPanel messages={messages} accounts={accounts} onOpenSubscriptions={() => setSurface("subscriptions")} onChanged={() => void reload()} /></div>}
        {surface === "subscriptions" && <div className="h-full overflow-y-auto pt-8"><SubscriptionManager messages={messages} accounts={accounts} onChanged={() => void reload()} /></div>}
        {surface === "rules" && <div className="h-full overflow-y-auto pt-8"><RulesPanel messages={messages} accounts={accounts} onChanged={() => void reload()} /></div>}
      </div>
    </div>
  );
}

function Sel<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-white/40">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="rounded-sm border border-white/10 bg-transparent px-1.5 py-0.5 text-[12.5px] text-white/80 focus:border-white/40 focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-black">{o.label}</option>)}
      </select>
    </label>
  );
}

function Tog({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("relative pb-0.5 transition-colors", on ? "text-white" : "text-white/40 hover:text-white/75")}>
      {children}
      {on && <span className="absolute inset-x-0 -bottom-px h-px bg-white/70" />}
    </button>
  );
}
