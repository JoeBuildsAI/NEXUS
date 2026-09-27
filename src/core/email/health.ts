import type { EmailAccount, Message, MessageCategory } from "@/core/types";
import { LOW_VALUE_CATEGORIES } from "./classify";
import { planUnsubscribe, type UnsubscribeCapability } from "./unsubscribe";

/**
 * Inbox Health: telemetry for communication. Every figure carries a
 * confidence label — KNOWN (provider-reported or exact over loaded mail),
 * ESTIMATED (extrapolated), UNAVAILABLE (provider does not expose it).
 */
export type Confidence = "KNOWN" | "ESTIMATED" | "UNAVAILABLE";

export interface Figure {
  value: number | null;
  confidence: Confidence;
  note?: string;
}

export interface SenderStat {
  key: string;
  accountId: string;
  sender: string;
  senderAddress: string;
  domain: string;
  listId: string | null;
  total: number;
  unread: number;
  recent30: number;
  lastAt: number;
  firstAt: number;
  /** Messages per week over the observed span (null when < 2 messages). */
  perWeek: number | null;
  categories: Partial<Record<MessageCategory, number>>;
  dominant: MessageCategory;
  isList: boolean;
  /** 0–1 confidence that this is a recurring mailing list. */
  listConfidence: number;
  unsubscribe: UnsubscribeCapability;
  /** Last message id (for unsubscribe metadata lookups). */
  lastMessageId: string;
  hasRule: boolean;
}

export interface CategoryTrend {
  category: MessageCategory;
  thisWeek: number;
  lastWeek: number;
}

export interface InboxHealth {
  analyzedAt: number;
  loaded: number;
  messages: Figure;
  unread: Figure;
  lists: Figure;
  unsubscribeCandidates: Figure;
  lowValue: Figure;
  size: Figure;
  senders: SenderStat[];
  topSenders: SenderStat[];
  inactiveLists: SenderStat[];
  trends: CategoryTrend[];
  /** Low-value messages older than 30 days (cleanup input). */
  lowValueIds: string[];
}

const WEEK = 7 * 86400_000;

export function analyzeInbox(messages: readonly Message[], accounts: readonly EmailAccount[], opts: { now?: number; ruledSenders?: ReadonlySet<string> } = {}): InboxHealth {
  const now = opts.now ?? Date.now();
  const live = messages.filter((m) => !m.archived);
  const bySender = new Map<string, SenderStat & { _ids: string[] }>();
  for (const m of live) {
    const address = m.senderAddress.toLowerCase();
    const key = `${m.accountId}|${m.listId?.toLowerCase() ?? address}`;
    const s = bySender.get(key) ?? {
      key, accountId: m.accountId, sender: m.sender, senderAddress: address, domain: address.split("@")[1] ?? "", listId: m.listId ?? null,
      total: 0, unread: 0, recent30: 0, lastAt: 0, firstAt: Infinity, perWeek: null, categories: {}, dominant: m.category, isList: false, listConfidence: 0, unsubscribe: "UNKNOWN", lastMessageId: m.id, hasRule: false, _ids: [],
    };
    s.total++;
    if (!m.read) s.unread++;
    if (m.timestamp > now - 30 * 86400_000) s.recent30++;
    if (m.timestamp > s.lastAt) { s.lastAt = m.timestamp; s.lastMessageId = m.id; }
    s.firstAt = Math.min(s.firstAt, m.timestamp);
    s.categories[m.category] = (s.categories[m.category] ?? 0) + 1;
    s._ids.push(m.id);
    bySender.set(key, s);
  }
  const senders: SenderStat[] = [];
  const idsByMessage = new Map(live.map((m) => [m.id, m]));
  for (const s of bySender.values()) {
    const span = Math.max(WEEK, s.lastAt - s.firstAt);
    s.perWeek = s.total >= 2 ? Math.round((s.total / (span / WEEK)) * 10) / 10 : null;
    s.dominant = (Object.entries(s.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other") as MessageCategory;
    const last = idsByMessage.get(s.lastMessageId);
    const bulkHeader = !!last?.listUnsubscribe || !!last?.listId;
    // Mailing-list confidence: bulk headers, cadence, low-value category, automated sender.
    let conf = 0;
    if (bulkHeader) conf += 0.6;
    if (s.total >= 3) conf += 0.15;
    if (LOW_VALUE_CATEGORIES.includes(s.dominant)) conf += 0.2;
    if (/^(no-?reply|newsletter|news|updates?|marketing|promo|digest)/i.test(s.senderAddress)) conf += 0.1;
    s.listConfidence = Math.min(1, Math.round(conf * 100) / 100);
    s.isList = s.listConfidence >= 0.6;
    s.unsubscribe = planUnsubscribe({ listUnsubscribe: last?.listUnsubscribe, listUnsubscribePost: last?.listUnsubscribePost, isBulk: s.isList }).capability;
    s.hasRule = opts.ruledSenders?.has(s.senderAddress) || opts.ruledSenders?.has(s.domain) || false;
    const { _ids, ...rest } = s;
    void _ids;
    senders.push(rest);
  }
  senders.sort((a, b) => b.total - a.total);

  const lists = senders.filter((s) => s.isList);
  // Inactive: a list whose mail you haven't read (≥ 75% unread over ≥ 3 messages).
  const inactive = lists.filter((s) => s.total >= 3 && s.unread / s.total >= 0.75).sort((a, b) => b.unread - a.unread);
  const lowValue = live.filter((m) => LOW_VALUE_CATEGORIES.includes(m.category) && m.timestamp < now - 30 * 86400_000);

  const knownTotals = accounts.map((a) => a.totals?.messages ?? null);
  const allKnown = accounts.length > 0 && knownTotals.every((t) => t != null);
  const knownUnread = accounts.map((a) => a.totals?.unread ?? null);
  const unreadKnown = accounts.length > 0 && knownUnread.every((t) => t != null);
  const sizeKnown = live.filter((m) => m.sizeBytes != null);

  const trends: CategoryTrend[] = (["important", "personal", "work", "receipt", "order", "financial", "travel", "newsletter", "promotion", "notification", "social", "security"] as MessageCategory[]).map((category) => ({
    category,
    thisWeek: live.filter((m) => m.category === category && m.timestamp > now - WEEK).length,
    lastWeek: live.filter((m) => m.category === category && m.timestamp <= now - WEEK && m.timestamp > now - 2 * WEEK).length,
  })).filter((t) => t.thisWeek + t.lastWeek > 0);

  return {
    analyzedAt: now,
    loaded: live.length,
    messages: allKnown ? { value: knownTotals.reduce((s, t) => s + (t ?? 0), 0), confidence: "KNOWN", note: "Reported by your mail providers." } : { value: live.length, confidence: "ESTIMATED", note: "Loaded by NEXUS so far; the provider did not report a total." },
    unread: unreadKnown ? { value: knownUnread.reduce((s, t) => s + (t ?? 0), 0), confidence: "KNOWN" } : { value: live.filter((m) => !m.read).length, confidence: "ESTIMATED", note: "Unread among loaded messages." },
    lists: { value: lists.length, confidence: "KNOWN", note: "Recurring senders with mailing-list signals among loaded mail." },
    unsubscribeCandidates: { value: inactive.length, confidence: "KNOWN", note: "Lists you almost never read." },
    lowValue: { value: lowValue.length, confidence: "KNOWN", note: "Newsletters, promotions, notifications and social mail older than 30 days." },
    size: sizeKnown.length === live.length && live.length > 0 ? { value: sizeKnown.reduce((s, m) => s + (m.sizeBytes ?? 0), 0), confidence: "KNOWN", note: "Provider size estimates for loaded mail." } : { value: null, confidence: "UNAVAILABLE", note: "Your provider does not report message sizes here — no storage estimate is invented." },
    senders,
    topSenders: senders.slice(0, 12),
    inactiveLists: inactive,
    trends,
    lowValueIds: lowValue.map((m) => m.id),
  };
}
