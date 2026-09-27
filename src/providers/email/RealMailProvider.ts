import type { EmailAccount, EmailConnectionState, EmailSyncState, InboxSummary, Message, ProviderHealth, Subscription } from "@/core/types";
import { ProviderOfflineError } from "@/core/errors";
import { classifyMessage, summarize, type UserRule } from "@/core/email/classify";
import type { RuleAction, RuleCondition, Translation } from "@/core/email/rules";
import type { CleanupOp } from "@/core/email/cleanup";
import { planUnsubscribe, type UnsubscribePlan } from "@/core/email/unsubscribe";
import { idPrefix, type MapContext } from "@/core/email/mappers";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { createLogger } from "@/lib/logger";
import type { MailApiResponse, MailBridge, MailProviderId } from "./MailBridge";
import type { EmailProvider } from "./EmailProvider";

// PRIVACY: this logger receives counts and statuses only — never addresses, subjects or bodies.
const log = createLogger("mail");

const SYNC_TTL = 90_000;
/** First sync loads this many; "load older" extends in pages. Never the whole mailbox. */
const INITIAL_MESSAGES = 200;
const MAX_MESSAGES = 2000;

export interface PageResult {
  messages: Message[];
  next: string | null;
}

export interface AdapterCapabilities {
  ruleEnableDisable: boolean;
  providerSearch: boolean;
  nativeUnsubscribe: boolean;
  sizeEstimates: boolean;
  mailboxTotals: boolean;
}

/** Provider-specific wire operations; everything else is shared. */
export interface MailAdapter {
  readonly id: MailProviderId;
  readonly label: string;
  readonly batchLimit: number;
  readonly capabilities: AdapterCapabilities;
  fetchProfile(api: ApiFn): Promise<{ address: string; displayName: string } | null>;
  fetchTotals(api: ApiFn): Promise<{ messages: number | null; unread: number | null }>;
  fetchPage(api: ApiFn, accountId: string, rules: readonly UserRule[], ctx: MapContext, cursor: string | null): Promise<PageResult>;
  search(api: ApiFn, accountId: string, rules: readonly UserRule[], ctx: MapContext, query: string): Promise<Message[]>;
  setRead(api: ApiFn, rawId: string, read: boolean): Promise<void>;
  archive(api: ApiFn, rawId: string): Promise<void>;
  delete(api: ApiFn, rawId: string): Promise<void>;
  batch(api: ApiFn, rawIds: string[], op: CleanupOp): Promise<{ succeeded: number; failed: number }>;
  listRules(api: ApiFn): Promise<{ providerRuleId: string; name: string; enabled: boolean }[]>;
  createRule(api: ApiFn, condition: RuleCondition, action: RuleAction, name: string): Promise<{ providerRuleId: string | null; capabilities: Translation["capabilities"] }>;
  deleteRule(api: ApiFn, providerRuleId: string): Promise<void>;
  setRuleEnabled(api: ApiFn, providerRuleId: string, enabled: boolean): Promise<void>;
  /** Provider-side match count for a rule preview (null when unsupported). */
  countMatches(api: ApiFn, condition: RuleCondition): Promise<number | null>;
}

export type ApiFn = (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => Promise<MailApiResponse>;

export class MailApiError extends Error {
  constructor(public readonly status: MailApiResponse["status"], public readonly httpStatus: number, public readonly retryAfterSecs: number | null) {
    super(`mail api: ${status}${httpStatus ? ` (${httpStatus})` : ""}`);
  }
}

export interface AccountRuntime {
  account: EmailAccount | null;
  connection: EmailConnectionState;
  sync: EmailSyncState;
  lastAttemptAt: number | null;
  loaded: number;
  hasMore: boolean;
}

/**
 * One real mail account (Outlook via Microsoft Graph or Gmail via Gmail API)
 * in one slot. Messages live in memory only; bodies are never persisted.
 * Typed connection state lets the UI say READY TO CONFIGURE / CONNECT /
 * CONNECTED / SIGN IN AGAIN / OFFLINE truthfully.
 */
export class RealMailProvider implements EmailProvider {
  readonly id: string;
  readonly accountId: string;
  private messages: Message[] = [];
  private account: EmailAccount | null = null;
  private sync: EmailSyncState = { lastSyncAt: null, syncing: false, error: null, rateLimitedUntil: null };
  private lastAttemptAt: number | null = null;
  private connection: EmailConnectionState = "not-configured";
  private inflight: Promise<void> | null = null;
  private cursor: string | null = null;
  private exhausted = false;

  constructor(
    private bridge: MailBridge,
    private adapter: MailAdapter,
    readonly slot = 1,
    private rules: () => readonly UserRule[] = () => useEmailRulesStore.getState().rules,
  ) {
    this.id = slot === 1 ? `real-${adapter.id}` : `real-${adapter.id}-${slot}`;
    this.accountId = `acct-${adapter.id}-${slot}`;
  }

  get providerId(): MailProviderId {
    return this.adapter.id;
  }
  get label(): string {
    return this.adapter.label;
  }
  get capabilities(): AdapterCapabilities {
    return this.adapter.capabilities;
  }
  /** Message ids owned by this account start with this prefix. */
  get prefix(): string {
    return idPrefix(this.adapter.id, this.slot);
  }
  owns(messageId: string): boolean {
    if (!messageId.startsWith(this.prefix)) return false;
    // "outlook:" must not claim "outlook:2:…".
    return this.slot !== 1 || !/^(outlook|gmail):\d:/.test(messageId);
  }
  connectionState(): EmailConnectionState {
    return this.connection;
  }
  syncState(): EmailSyncState {
    return this.sync;
  }
  runtime(): AccountRuntime {
    return { account: this.account, connection: this.connection, sync: this.sync, lastAttemptAt: this.lastAttemptAt, loaded: this.messages.length, hasMore: !this.exhausted && this.messages.length < MAX_MESSAGES };
  }

  private api: ApiFn = async (method, path, body) => {
    // Paths must be whitespace-free for the native allowlist; OData queries carry spaces.
    const r = await this.bridge.api(this.adapter.id, this.slot, method, path.replace(/ /g, "%20"), body);
    if (r.status === "ok") return r;
    if (r.status === "rate-limited") this.sync = { ...this.sync, rateLimitedUntil: Date.now() + (r.retryAfterSecs ?? 60) * 1000 };
    if (r.status === "auth-error") this.connection = "auth-error";
    if (r.status === "network-error") this.connection = "offline";
    throw new MailApiError(r.status, r.httpStatus, r.retryAfterSecs);
  };

  private ctx(): MapContext {
    const own = this.account?.address.split("@")[1]?.toLowerCase() ?? null;
    return { slot: this.slot, ownDomain: own };
  }

  async refreshStatus(): Promise<EmailConnectionState> {
    try {
      const s = await this.bridge.status(this.adapter.id, this.slot);
      if (!s.clientConfigured) this.connection = "not-configured";
      else if (s.pending) this.connection = "connecting";
      else if (!s.connected) this.connection = "ready-to-connect";
      // "offline" is transient (retry on next sync); "auth-error" is sticky
      // until the user reconnects, so a rejected token is never hidden.
      else if (this.connection !== "auth-error") this.connection = "connected";
    } catch {
      this.connection = "not-configured";
    }
    return this.connection;
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
    this.connection = "connecting";
    const r = await this.bridge.connect(this.adapter.id, this.slot);
    if (r.ok) this.connection = "connected"; // clears a sticky auth-error
    await this.refreshStatus();
    if (r.ok) {
      this.reset();
      log.info("Mail account connected", { provider: this.adapter.id, slot: this.slot });
    }
    return r;
  }

  async disconnect(): Promise<void> {
    await this.bridge.disconnect(this.adapter.id, this.slot);
    this.reset();
    this.account = null;
    await this.refreshStatus();
    log.info("Mail account disconnected", { provider: this.adapter.id, slot: this.slot });
  }

  private reset() {
    this.messages = [];
    this.cursor = null;
    this.exhausted = false;
    this.sync = { lastSyncAt: null, syncing: false, error: null, rateLimitedUntil: null };
  }

  /** Sync the newest messages (bounded, paginated, rate-limit aware). Safe to call often. */
  async syncNow(force = false): Promise<void> {
    if (this.inflight) return this.inflight;
    if (!force && this.sync.lastSyncAt && Date.now() - this.sync.lastSyncAt < SYNC_TTL) return;
    if (this.sync.rateLimitedUntil && Date.now() < this.sync.rateLimitedUntil) return;
    this.inflight = this.run(async () => {
      if (!this.account) {
        const p = await this.adapter.fetchProfile(this.api);
        if (p) this.account = { id: this.accountId, address: p.address, displayName: p.displayName, provider: this.adapter.id, totals: null };
      }
      if (this.account && this.adapter.capabilities.mailboxTotals) {
        const totals = await this.adapter.fetchTotals(this.api).catch(() => null);
        if (totals) this.account = { ...this.account, totals };
      }
      // Fresh head: first pages until INITIAL_MESSAGES; keep locally known optimistic state.
      const fresh: Message[] = [];
      let cursor: string | null = null;
      do {
        const page = await this.adapter.fetchPage(this.api, this.accountId, this.rules(), this.ctx(), cursor);
        fresh.push(...page.messages);
        cursor = page.next;
      } while (cursor && fresh.length < INITIAL_MESSAGES);
      const local = new Map(this.messages.map((m) => [m.id, m]));
      const older = this.messages.filter((m) => !fresh.some((f) => f.id === m.id) && (fresh.length === 0 || m.timestamp < fresh[fresh.length - 1]!.timestamp));
      this.messages = [...fresh.map((m) => { const l = local.get(m.id); return l ? { ...m, archived: l.archived || m.archived, read: l.read || m.read } : m; }), ...older];
      this.cursor = cursor;
      this.exhausted = !cursor;
      this.sync = { lastSyncAt: Date.now(), syncing: false, error: null, rateLimitedUntil: null };
      log.info("Mail sync complete", { provider: this.adapter.id, slot: this.slot, messages: this.messages.length });
    });
    return this.inflight;
  }

  /** Incremental loading: the next older page (bounded by MAX_MESSAGES). */
  async loadOlder(): Promise<number> {
    if (this.exhausted || this.messages.length >= MAX_MESSAGES || this.connection !== "connected") return 0;
    let added = 0;
    await this.run(async () => {
      const page = await this.adapter.fetchPage(this.api, this.accountId, this.rules(), this.ctx(), this.cursor);
      const known = new Set(this.messages.map((m) => m.id));
      const fresh = page.messages.filter((m) => !known.has(m.id));
      this.messages = [...this.messages, ...fresh];
      this.cursor = page.next;
      this.exhausted = !page.next;
      added = fresh.length;
      this.sync = { ...this.sync, syncing: false, error: null };
    });
    return added;
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.lastAttemptAt = Date.now();
    await this.refreshStatus();
    if (this.connection !== "connected") return;
    this.sync = { ...this.sync, syncing: true, error: null };
    try {
      await work();
    } catch (err) {
      const e = err instanceof MailApiError ? err : null;
      this.sync = { ...this.sync, syncing: false, error: e ? e.status : "error" };
      log.warn("Mail operation failed", { provider: this.adapter.id, slot: this.slot, status: e?.status ?? "unknown" });
    } finally {
      this.inflight = null;
    }
  }

  /** Provider-side search (bounded). Results are not merged into the inbox cache. */
  async search(query: string): Promise<Message[]> {
    if (this.connection !== "connected" || !query.trim()) return [];
    try {
      return await this.adapter.search(this.api, this.accountId, this.rules(), this.ctx(), query.trim().slice(0, 200));
    } catch (err) {
      log.warn("Mail search failed", { provider: this.adapter.id, status: err instanceof MailApiError ? err.status : "unknown" });
      return [];
    }
  }

  // ---------------- EmailProvider ----------------
  async getAccounts(): Promise<readonly EmailAccount[]> {
    await this.syncNow();
    return this.account ? [this.account] : [];
  }

  async getMessages(): Promise<readonly Message[]> {
    await this.syncNow();
    if (this.connection === "offline" && this.messages.length === 0) throw new ProviderOfflineError("Email", "Mail service unreachable.");
    // Re-apply current rules so corrections take effect immediately.
    const rules = this.rules();
    const live = this.messages.filter((m) => !m.archived);
    if (!rules.length) return live;
    return live.map((m) => {
      const c = classifyMessage({ sender: m.sender, senderAddress: m.senderAddress, subject: m.subject, preview: m.preview, listUnsubscribe: m.listUnsubscribe, listId: m.listId, ownDomain: this.ctx().ownDomain }, rules);
      return c.fromRule ? { ...m, category: c.category, signals: c.signals } : m;
    });
  }

  async getSummary(sinceTimestamp: number): Promise<InboxSummary> {
    const msgs = await this.getMessages();
    const s = summarize(msgs, sinceTimestamp);
    return { total: s.total, unread: s.unread, important: s.important, newsletters: s.newsletters, receipts: s.receipts, other: s.total - s.important - s.newsletters - s.receipts, sinceTimestamp };
  }

  private rawId(messageId: string): string {
    return messageId.slice(this.prefix.length);
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    this.messages = this.messages.map((m) => (m.id === messageId ? { ...m, read } : m));
    await this.adapter.setRead(this.api, this.rawId(messageId), read).catch((e) => log.warn("markRead failed", { status: e instanceof MailApiError ? e.status : "unknown" }));
  }
  async archive(messageId: string): Promise<void> {
    this.messages = this.messages.map((m) => (m.id === messageId ? { ...m, archived: true } : m));
    await this.adapter.archive(this.api, this.rawId(messageId)).catch((e) => log.warn("archive failed", { status: e instanceof MailApiError ? e.status : "unknown" }));
  }
  async delete(messageId: string): Promise<void> {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    await this.adapter.delete(this.api, this.rawId(messageId)).catch((e) => log.warn("delete failed", { status: e instanceof MailApiError ? e.status : "unknown" }));
  }

  /** Bulk operation for cleanup transactions; ids must be owned by this account. Never hides failures. */
  async batchOwned(messageIds: string[], op: CleanupOp): Promise<{ succeeded: number; failed: number; error?: string }> {
    const mine = messageIds.filter((id) => this.owns(id));
    if (mine.length !== messageIds.length) return { succeeded: 0, failed: messageIds.length, error: "ids belong to another account" };
    try {
      const r = await this.adapter.batch(this.api, mine.map((id) => this.rawId(id)), op);
      const done = new Set(mine);
      if (op === "trash") this.messages = this.messages.filter((m) => !done.has(m.id));
      else if (op === "archive") this.messages = this.messages.map((m) => (done.has(m.id) ? { ...m, archived: true } : m));
      else this.messages = this.messages.map((m) => (done.has(m.id) ? { ...m, read: true } : m));
      return r;
    } catch (err) {
      const e = err instanceof MailApiError ? err : null;
      return { succeeded: 0, failed: mine.length, error: e ? `${e.status}${e.httpStatus ? ` (${e.httpStatus})` : ""}` : "error" };
    }
  }

  /** What NEXUS can safely do about a sender, from the latest message's metadata. */
  unsubscribePlan(messageId: string): UnsubscribePlan {
    const m = this.messages.find((x) => x.id === messageId);
    return planUnsubscribe({ listUnsubscribe: m?.listUnsubscribe, listUnsubscribePost: m?.listUnsubscribePost, isBulk: !!(m?.listUnsubscribe || m?.listId) });
  }

  /** RFC 8058 one-click via the native layer. Falls back to a rule when unsupported. */
  async unsubscribeOneClick(url: string): Promise<{ ok: boolean; detail: string }> {
    const r = await this.bridge.unsubscribeOneClick(url);
    return { ok: r.ok, detail: r.detail };
  }

  /**
   * Legacy single-message unsubscribe: record a domain rule and archive. The
   * Subscription manager uses the capability model for one-click / manual.
   */
  async unsubscribe(messageId: string): Promise<void> {
    const m = this.messages.find((x) => x.id === messageId);
    if (!m) return;
    useEmailRulesStore.getState().setRule({ kind: "domain", value: m.senderAddress.split("@")[1] ?? m.senderAddress, category: "subscription" });
    await this.archive(messageId);
  }

  async getSubscriptions(): Promise<readonly Subscription[]> {
    const msgs = await this.getMessages().catch(() => [] as readonly Message[]);
    const bySender = new Map<string, Message[]>();
    for (const m of msgs) {
      if (!m.canUnsubscribe && !m.listId && !["newsletter", "subscription", "promotion"].includes(m.category)) continue;
      const key = m.senderAddress.toLowerCase();
      bySender.set(key, [...(bySender.get(key) ?? []), m]);
    }
    const now = Date.now();
    return [...bySender.entries()].map(([address, list]) => {
      const span = Math.max(7 * 86400_000, now - Math.min(...list.map((m) => m.timestamp)));
      const perWeek = Math.max(1, Math.round((list.length / span) * 7 * 86400_000));
      const opened = list.filter((m) => m.read).map((m) => m.timestamp);
      return { id: `sub:${address}`, sender: list[0]!.sender, senderAddress: address, category: list.some((m) => m.category === "newsletter") ? "newsletter" : "subscription", frequencyPerWeek: perWeek, lastOpened: opened.length ? Math.max(...opened) : null, status: "active" } satisfies Subscription;
    });
  }

  async unsubscribeSender(subscriptionId: string): Promise<void> {
    const address = subscriptionId.replace(/^sub:/, "");
    useEmailRulesStore.getState().setRule({ kind: "address", value: address, category: "subscription" });
    for (const m of this.messages.filter((x) => x.senderAddress.toLowerCase() === address)) await this.archive(m.id);
  }

  // ---------------- routing rules ----------------
  async listProviderRules() {
    if (this.connection !== "connected") return [];
    try {
      return await this.adapter.listRules(this.api);
    } catch {
      return [];
    }
  }
  async createRule(condition: RuleCondition, action: RuleAction, name: string) {
    return this.adapter.createRule(this.api, condition, action, name);
  }
  async deleteRule(providerRuleId: string) {
    return this.adapter.deleteRule(this.api, providerRuleId);
  }
  async setRuleEnabled(providerRuleId: string, enabled: boolean) {
    return this.adapter.setRuleEnabled(this.api, providerRuleId, enabled);
  }
  async countMatches(condition: RuleCondition): Promise<number | null> {
    if (this.connection !== "connected") return null;
    try {
      return await this.adapter.countMatches(this.api, condition);
    } catch {
      return null;
    }
  }

  async health(): Promise<ProviderHealth> {
    const state = await this.refreshStatus();
    const checkedAt = Date.now();
    const label = this.slot === 1 ? this.adapter.label : `${this.adapter.label} ${this.slot}`;
    switch (state) {
      case "not-configured": return { state: "not-configured", summary: `${label} · ready to configure`, detail: "Add an application client id in Integrations.", checkedAt };
      case "ready-to-connect": return { state: "not-configured", summary: `${label} · ready to connect`, checkedAt };
      case "connecting": return { state: "degraded", summary: `${label} · waiting for browser`, checkedAt };
      case "auth-error": return { state: "error", summary: `${label} · sign in again`, detail: "The stored token was rejected.", checkedAt };
      case "offline": return { state: "unavailable", summary: `${label} · offline`, checkedAt };
      default: return { state: "available", summary: `${label} · connected${this.sync.lastSyncAt ? "" : " · syncing"}`, checkedAt };
    }
  }
}
