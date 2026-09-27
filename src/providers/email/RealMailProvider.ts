import type { EmailAccount, EmailConnectionState, EmailSyncState, InboxSummary, Message, ProviderHealth, Subscription } from "@/core/types";
import { ProviderOfflineError } from "@/core/errors";
import { summarize, type UserRule } from "@/core/email/classify";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { createLogger } from "@/lib/logger";
import type { MailApiResponse, MailBridge, MailProviderId } from "./MailBridge";
import type { EmailProvider } from "./EmailProvider";

// PRIVACY: this logger receives counts and statuses only — never addresses, subjects or bodies.
const log = createLogger("mail");

const SYNC_TTL = 90_000;
const MAX_MESSAGES = 400;

/** Provider-specific wire operations; everything else is shared. */
export interface MailAdapter {
  readonly id: MailProviderId;
  readonly label: string;
  fetchProfile(api: ApiFn): Promise<{ address: string; displayName: string } | null>;
  /** Fetch up to `limit` inbox messages, newest first. */
  fetchInbox(api: ApiFn, accountId: string, rules: readonly UserRule[], limit: number): Promise<Message[]>;
  setRead(api: ApiFn, rawId: string, read: boolean): Promise<void>;
  archive(api: ApiFn, rawId: string): Promise<void>;
  delete(api: ApiFn, rawId: string): Promise<void>;
}

export type ApiFn = (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => Promise<MailApiResponse>;

export class MailApiError extends Error {
  constructor(public readonly status: MailApiResponse["status"], public readonly httpStatus: number, public readonly retryAfterSecs: number | null) {
    super(`mail api: ${status}${httpStatus ? ` (${httpStatus})` : ""}`);
  }
}

/**
 * Real email provider (Outlook via Microsoft Graph, Gmail via Gmail API).
 * Holds messages in memory only — bodies are never persisted. Exposes a typed
 * connection state so the UI can say READY TO CONFIGURE / CONNECT / CONNECTED
 * truthfully instead of pretending.
 */
export class RealMailProvider implements EmailProvider {
  readonly id: string;
  private messages: Message[] = [];
  private account: EmailAccount | null = null;
  private sync: EmailSyncState = { lastSyncAt: null, syncing: false, error: null, rateLimitedUntil: null };
  private connection: EmailConnectionState = "not-configured";
  private inflight: Promise<void> | null = null;

  constructor(private bridge: MailBridge, private adapter: MailAdapter, private rules: () => readonly UserRule[] = () => useEmailRulesStore.getState().rules) {
    this.id = `real-${adapter.id}`;
  }

  get providerId(): MailProviderId {
    return this.adapter.id;
  }
  connectionState(): EmailConnectionState {
    return this.connection;
  }
  syncState(): EmailSyncState {
    return this.sync;
  }

  private api: ApiFn = async (method, path, body) => {
    const r = await this.bridge.api(this.adapter.id, method, path, body);
    if (r.status === "ok") return r;
    if (r.status === "rate-limited") this.sync = { ...this.sync, rateLimitedUntil: Date.now() + (r.retryAfterSecs ?? 60) * 1000 };
    if (r.status === "auth-error") this.connection = "auth-error";
    if (r.status === "network-error") this.connection = "offline";
    throw new MailApiError(r.status, r.httpStatus, r.retryAfterSecs);
  };

  async refreshStatus(): Promise<EmailConnectionState> {
    try {
      const s = await this.bridge.status(this.adapter.id);
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
    const r = await this.bridge.connect(this.adapter.id);
    if (r.ok) this.connection = "connected"; // clears a sticky auth-error
    await this.refreshStatus();
    if (r.ok) {
      this.messages = [];
      this.sync = { lastSyncAt: null, syncing: false, error: null, rateLimitedUntil: null };
      log.info("Mail account connected", { provider: this.adapter.id });
    }
    return r;
  }

  async disconnect(): Promise<void> {
    await this.bridge.disconnect(this.adapter.id);
    this.messages = [];
    this.account = null;
    this.sync = { lastSyncAt: null, syncing: false, error: null, rateLimitedUntil: null };
    await this.refreshStatus();
    log.info("Mail account disconnected", { provider: this.adapter.id });
  }

  /** Sync inbox (bounded, paginated, rate-limit aware). Safe to call often. */
  async syncNow(force = false): Promise<void> {
    if (this.inflight) return this.inflight;
    if (!force && this.sync.lastSyncAt && Date.now() - this.sync.lastSyncAt < SYNC_TTL) return;
    if (this.sync.rateLimitedUntil && Date.now() < this.sync.rateLimitedUntil) return;
    this.inflight = (async () => {
      await this.refreshStatus();
      if (this.connection !== "connected") return;
      this.sync = { ...this.sync, syncing: true, error: null };
      try {
        if (!this.account) {
          const p = await this.adapter.fetchProfile(this.api);
          if (p) this.account = { id: `acct-${this.adapter.id}`, address: p.address, displayName: p.displayName, provider: this.adapter.id };
        }
        const accountId = this.account?.id ?? `acct-${this.adapter.id}`;
        const fresh = await this.adapter.fetchInbox(this.api, accountId, this.rules(), MAX_MESSAGES);
        // Preserve local optimistic state for ids we already have.
        const local = new Map(this.messages.map((m) => [m.id, m]));
        this.messages = fresh.map((m) => {
          const l = local.get(m.id);
          return l ? { ...m, archived: l.archived || m.archived } : m;
        });
        this.sync = { lastSyncAt: Date.now(), syncing: false, error: null, rateLimitedUntil: null };
        log.info("Mail sync complete", { provider: this.adapter.id, messages: this.messages.length });
      } catch (err) {
        const e = err instanceof MailApiError ? err : null;
        this.sync = { ...this.sync, syncing: false, error: e ? e.status : "error", lastSyncAt: this.sync.lastSyncAt ?? null };
        log.warn("Mail sync failed", { provider: this.adapter.id, status: e?.status ?? "unknown" });
      }
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
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
    if (rules.length) {
      const { classifyMessage } = await import("@/core/email/classify");
      return this.messages.filter((m) => !m.archived).map((m) => {
        const c = classifyMessage({ sender: m.sender, senderAddress: m.senderAddress, subject: m.subject, preview: m.preview, listUnsubscribe: m.listUnsubscribe }, rules);
        return c.fromRule ? { ...m, category: c.category, signals: c.signals } : m;
      });
    }
    return this.messages.filter((m) => !m.archived);
  }

  async getSummary(sinceTimestamp: number): Promise<InboxSummary> {
    const msgs = await this.getMessages();
    const s = summarize(msgs, sinceTimestamp);
    return { total: s.total, unread: s.unread, important: s.important, newsletters: s.newsletters, receipts: s.receipts, other: s.notifications + s.personal + s.other, sinceTimestamp };
  }

  private rawId(messageId: string): string {
    return messageId.replace(/^(outlook|gmail):/, "");
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

  /**
   * Unsubscribe: providers don't expose one-click unsubscribe uniformly. NEXUS
   * archives the message and records a domain rule; when a List-Unsubscribe
   * https URL exists the UI offers to open it (never mailto, never automatic).
   */
  async unsubscribe(messageId: string): Promise<void> {
    const m = this.messages.find((x) => x.id === messageId);
    if (!m) return;
    useEmailRulesStore.getState().setRule({ kind: "domain", value: m.senderAddress.split("@")[1] ?? m.senderAddress, category: "subscription" });
    await this.archive(messageId);
  }

  async getSubscriptions(): Promise<readonly Subscription[]> {
    const msgs = await this.getMessages().catch(() => [] as readonly Message[]);
    const byDomain = new Map<string, Message[]>();
    for (const m of msgs) {
      if (!m.canUnsubscribe && m.category !== "newsletter" && m.category !== "subscription") continue;
      const key = m.senderAddress.toLowerCase();
      byDomain.set(key, [...(byDomain.get(key) ?? []), m]);
    }
    const now = Date.now();
    return [...byDomain.entries()].map(([address, list]) => {
      const span = Math.max(7 * 86400_000, now - Math.min(...list.map((m) => m.timestamp)));
      const perWeek = Math.max(1, Math.round((list.length / span) * 7 * 86400_000));
      const opened = list.filter((m) => m.read).map((m) => m.timestamp);
      return {
        id: `sub:${address}`,
        sender: list[0]!.sender,
        senderAddress: address,
        category: list.some((m) => m.category === "newsletter") ? "newsletter" : "subscription",
        frequencyPerWeek: perWeek,
        lastOpened: opened.length ? Math.max(...opened) : null,
        status: "active",
      } satisfies Subscription;
    });
  }

  async unsubscribeSender(subscriptionId: string): Promise<void> {
    const address = subscriptionId.replace(/^sub:/, "");
    useEmailRulesStore.getState().setRule({ kind: "address", value: address, category: "subscription" });
    for (const m of this.messages.filter((x) => x.senderAddress.toLowerCase() === address)) await this.archive(m.id);
  }

  async health(): Promise<ProviderHealth> {
    const state = await this.refreshStatus();
    const checkedAt = Date.now();
    switch (state) {
      case "not-configured": return { state: "not-configured", summary: `${this.adapter.label} · ready to configure`, detail: "Add an application client id in Integrations.", checkedAt };
      case "ready-to-connect": return { state: "not-configured", summary: `${this.adapter.label} · ready to connect`, checkedAt };
      case "connecting": return { state: "degraded", summary: `${this.adapter.label} · waiting for browser`, checkedAt };
      case "auth-error": return { state: "error", summary: `${this.adapter.label} · sign in again`, detail: "The stored token was rejected.", checkedAt };
      case "offline": return { state: "unavailable", summary: `${this.adapter.label} · offline`, checkedAt };
      default: return { state: "available", summary: `${this.adapter.label} · connected${this.sync.lastSyncAt ? "" : " · syncing"}`, checkedAt };
    }
  }
}
