import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailAccount, Message } from "@/core/types";
import { VIEW_CATEGORIES, type InboxView } from "@/core/email/classify";
import { getProviders } from "@/providers";
import { useDevStore } from "@/state/devStore";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { useEmailAccountsStore } from "@/state/emailAccountsStore";
import { isOffline } from "@/core/errors";

export type DateRange = "any" | "today" | "7d" | "30d" | "90d";
export type SortKey = "newest" | "oldest" | "sender" | "unread";

export interface InboxFilters {
  view: InboxView;
  accountId: string | "all";
  provider: "all" | "gmail" | "outlook" | "mock";
  unreadOnly: boolean;
  attachmentsOnly: boolean;
  starredOnly: boolean;
  sender: string | null;
  range: DateRange;
  sort: SortKey;
  query: string;
}

export const DEFAULT_FILTERS: InboxFilters = { view: "all", accountId: "all", provider: "all", unreadOnly: false, attachmentsOnly: false, starredOnly: false, sender: null, range: "any", sort: "newest", query: "" };

export interface ThreadRow {
  /** Latest message of the thread (or the message itself). */
  head: Message;
  count: number;
  unread: number;
  ids: string[];
}

const RANGE_MS: Record<DateRange, number> = { any: Infinity, today: 86400_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000, "90d": 90 * 86400_000 };

export function applyFilters(messages: readonly Message[], f: InboxFilters, now = Date.now()): Message[] {
  const cats = f.view === "cleanup" ? null : VIEW_CATEGORIES[f.view];
  const q = f.query.trim().toLowerCase();
  const out = messages.filter((m) => {
    if (cats && !(cats as readonly string[]).includes(m.category)) return false;
    if (f.accountId !== "all" && m.accountId !== f.accountId) return false;
    if (f.provider !== "all" && !m.accountId.includes(f.provider) && !m.id.startsWith(`${f.provider}:`)) return false;
    if (f.unreadOnly && m.read) return false;
    if (f.attachmentsOnly && !m.hasAttachments) return false;
    if (f.starredOnly && !m.starred) return false;
    if (f.sender && m.senderAddress.toLowerCase() !== f.sender.toLowerCase()) return false;
    if (f.range !== "any" && now - m.timestamp > RANGE_MS[f.range]) return false;
    if (q && !(m.subject.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q) || m.senderAddress.includes(q) || m.preview.toLowerCase().includes(q))) return false;
    return true;
  });
  switch (f.sort) {
    case "oldest": return out.sort((a, b) => a.timestamp - b.timestamp);
    case "sender": return out.sort((a, b) => a.sender.localeCompare(b.sender) || b.timestamp - a.timestamp);
    case "unread": return out.sort((a, b) => Number(a.read) - Number(b.read) || b.timestamp - a.timestamp);
    default: return out.sort((a, b) => b.timestamp - a.timestamp);
  }
}

/** Group by thread id (messages without a thread stand alone); preserves the incoming sort by head. */
export function groupThreads(messages: readonly Message[]): ThreadRow[] {
  const rows: ThreadRow[] = [];
  const byThread = new Map<string, ThreadRow>();
  for (const m of messages) {
    const key = m.threadId ? `${m.accountId}|${m.threadId}` : null;
    if (!key) { rows.push({ head: m, count: 1, unread: m.read ? 0 : 1, ids: [m.id] }); continue; }
    const t = byThread.get(key);
    if (t) { t.count++; if (!m.read) t.unread++; t.ids.push(m.id); continue; }
    const row: ThreadRow = { head: m, count: 1, unread: m.read ? 0 : 1, ids: [m.id] };
    byThread.set(key, row);
    rows.push(row);
  }
  return rows;
}

/**
 * Inbox data: loaded messages (bounded, incremental), accounts, filters,
 * optional provider search. Re-derives when rules or dev simulation change.
 */
export function useInbox() {
  const provider = useMemo(() => getProviders().email, []);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [filters, setFiltersState] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<"real" | "demo" | "none">("demo");
  const gen = useRef(0);
  const emailConnected = useDevStore((s) => s.emailConnected);
  const emailPulse = useDevStore((s) => s.emailPulse);
  const emailLibrarySize = useDevStore((s) => s.emailLibrarySize);
  const hugeThread = useDevStore((s) => s.hugeThread);
  const emailFailure = useDevStore((s) => s.emailFailure);
  const providerExceptions = useDevStore((s) => s.providerExceptions);
  const rules = useEmailRulesStore((s) => s.rules);
  const slots = useEmailAccountsStore((s) => s.accounts);

  const reload = useCallback(async () => {
    const g = ++gen.current;
    setLoading(true);
    try {
      const withMode = provider as { mode?: () => Promise<"real" | "demo" | "none"> };
      const [msgs, accts, m] = await Promise.all([provider.getMessages(), provider.getAccounts().catch(() => [] as readonly EmailAccount[]), withMode.mode ? withMode.mode() : Promise.resolve("demo" as const)]);
      if (g !== gen.current) return;
      setMessages([...msgs]);
      setAccounts([...accts]);
      setMode(m);
      setError(null);
    } catch (e) {
      if (g !== gen.current) return;
      setError(e);
      if (!isOffline(e)) setMessages((prev) => prev ?? []);
    } finally {
      if (g === gen.current) setLoading(false);
    }
  }, [provider]);

  useEffect(() => { void reload(); }, [reload, emailConnected, emailPulse, emailLibrarySize, hugeThread, emailFailure, providerExceptions, rules, slots]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !provider.loadOlder || !(provider.hasMore?.() ?? false)) return;
    setLoadingMore(true);
    try {
      const added = await provider.loadOlder();
      if (added > 0) setMessages([...(await provider.getMessages())]);
    } catch {
      /* surfaced by the next reload */
    } finally {
      setLoadingMore(false);
    }
  }, [provider, loadingMore]);

  const searchProvider = useCallback(async (q: string) => {
    if (!provider.search || !q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      setSearchResults([...(await provider.search(q))]);
    } finally {
      setSearching(false);
    }
  }, [provider]);

  const setFilters = useCallback((patch: Partial<InboxFilters>) => {
    setFiltersState((f) => ({ ...f, ...patch }));
    if (patch.query !== undefined || patch.view !== undefined) setSearchResults(null);
  }, []);

  const filtered = useMemo(() => applyFilters(searchResults ?? messages ?? [], filters), [searchResults, messages, filters]);
  const threads = useMemo(() => groupThreads(filtered), [filtered]);
  const unread = useMemo(() => (messages ?? []).filter((m) => !m.read).length, [messages]);

  return { provider, messages: messages ?? [], accounts, error, loading, loadingMore, hasMore: provider.hasMore?.() ?? false, loadMore, filters, setFilters, resetFilters: () => { setFiltersState(DEFAULT_FILTERS); setSearchResults(null); }, filtered, threads, unread, reload, mode, searchProvider, searching, searchResults, clearSearch: () => setSearchResults(null) };
}
