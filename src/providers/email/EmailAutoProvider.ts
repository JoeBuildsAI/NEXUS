import type { EmailAccount, InboxSummary, Message, ProviderHealth, Subscription } from "@/core/types";
import type { CleanupOp } from "@/core/email/cleanup";
import { useEmailAccountsStore, type MailAccountSlot } from "@/state/emailAccountsStore";
import type { EmailProvider } from "./EmailProvider";
import type { MockEmailProvider } from "./MockEmailProvider";
import { RealMailProvider, type MailAdapter } from "./RealMailProvider";
import type { MailBridge } from "./MailBridge";

/**
 * Unified inbox over every configured account slot (Outlook / Gmail × 1–9),
 * with demo fallback when nothing is connected (labelled as demo by `mode()`).
 * Every message keeps its account identity; actions are routed by id prefix so
 * nothing can be performed against the wrong account.
 */
export class EmailAutoProvider implements EmailProvider {
  readonly id = "auto-email";
  private providers = new Map<string, RealMailProvider>();

  constructor(
    private bridge: MailBridge,
    private adapters: Record<"outlook" | "gmail", MailAdapter>,
    private mock: MockEmailProvider,
    private allowDemoFallback: boolean,
    private slots: () => readonly MailAccountSlot[] = () => useEmailAccountsStore.getState().accounts,
  ) {}

  /** Providers for the currently configured slots (created lazily, dropped when a slot is removed). */
  get real(): RealMailProvider[] {
    const wanted = this.slots();
    for (const s of wanted) {
      if (!this.providers.has(s.id)) this.providers.set(s.id, new RealMailProvider(this.bridge, this.adapters[s.provider], s.slot));
    }
    for (const id of [...this.providers.keys()]) if (!wanted.some((s) => s.id === id)) this.providers.delete(id);
    return wanted.map((s) => this.providers.get(s.id)!);
  }

  providerFor(accountId: string): RealMailProvider | undefined {
    return this.real.find((p) => p.accountId === accountId);
  }

  private async connected(): Promise<RealMailProvider[]> {
    const states = await Promise.all(this.real.map(async (p) => [p, await p.refreshStatus()] as const));
    return states.filter(([, s]) => s === "connected" || s === "offline" || s === "auth-error").map(([p]) => p);
  }

  async mode(): Promise<"real" | "demo" | "none"> {
    const live = await this.connected();
    if (live.length) return "real";
    return this.allowDemoFallback ? "demo" : "none";
  }

  private ownerOf(messageId: string): RealMailProvider | undefined {
    return this.real.find((p) => p.owns(messageId));
  }

  async getAccounts(): Promise<readonly EmailAccount[]> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.getAccounts() : [];
    const labels = new Map(this.slots().map((s) => [s.id, s.label]));
    return (await Promise.all(live.map((p) => p.getAccounts().catch(() => [] as readonly EmailAccount[])))).flat().map((a) => ({ ...a, label: labels.get(a.id) ?? a.label }));
  }

  async getMessages(): Promise<readonly Message[]> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.getMessages() : [];
    const results = await Promise.allSettled(live.map((p) => p.getMessages()));
    const ok = results.filter((r): r is PromiseFulfilledResult<readonly Message[]> => r.status === "fulfilled").flatMap((r) => [...r.value]);
    if (!ok.length && results.some((r) => r.status === "rejected")) throw (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
    return ok.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Incremental loading across accounts; returns how many messages were added. */
  async loadOlder(): Promise<number> {
    const live = await this.connected();
    if (!live.length) return this.mock.loadOlder?.() ?? 0;
    const added = await Promise.all(live.map((p) => p.loadOlder().catch(() => 0)));
    return added.reduce((s, n) => s + n, 0);
  }

  /** Whether any account can still load older mail. */
  hasMore(): boolean {
    return this.real.some((p) => p.runtime().hasMore && p.connectionState() === "connected") || (this.mock.hasMore?.() ?? false);
  }

  /** Provider-side search across connected accounts (bounded). Demo mode searches locally. */
  async search(query: string): Promise<readonly Message[]> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.search?.(query) ?? [] : [];
    const parts = await Promise.all(live.map((p) => p.search(query)));
    return parts.flat().sort((a, b) => b.timestamp - a.timestamp);
  }

  async getSummary(sinceTimestamp: number): Promise<InboxSummary> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.getSummary(sinceTimestamp) : { total: 0, unread: 0, important: 0, newsletters: 0, receipts: 0, other: 0, sinceTimestamp };
    const parts = await Promise.all(live.map((p) => p.getSummary(sinceTimestamp).catch(() => null)));
    return parts.filter((p): p is InboxSummary => !!p).reduce<InboxSummary>((acc, s) => ({ total: acc.total + s.total, unread: acc.unread + s.unread, important: acc.important + s.important, newsletters: acc.newsletters + s.newsletters, receipts: acc.receipts + s.receipts, other: acc.other + s.other, sinceTimestamp }), { total: 0, unread: 0, important: 0, newsletters: 0, receipts: 0, other: 0, sinceTimestamp });
  }

  private target(messageId: string): EmailProvider {
    return this.ownerOf(messageId) ?? this.mock;
  }
  markRead(id: string, read: boolean) { return this.target(id).markRead(id, read); }
  archive(id: string) { return this.target(id).archive(id); }
  delete(id: string) { return this.target(id).delete(id); }
  unsubscribe(id: string) { return this.target(id).unsubscribe(id); }

  /** Bulk op routed per account; ids that belong to no account are reported failed, never guessed. */
  async batch(accountId: string, messageIds: string[], op: CleanupOp): Promise<{ succeeded: number; failed: number; error?: string }> {
    const p = this.providerFor(accountId);
    if (p) return p.batchOwned(messageIds, op);
    if (this.mock.batch) return this.mock.batch(accountId, messageIds, op);
    return { succeeded: 0, failed: messageIds.length, error: "unknown account" };
  }

  async getSubscriptions(): Promise<readonly Subscription[]> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.getSubscriptions() : [];
    return (await Promise.all(live.map((p) => p.getSubscriptions().catch(() => [] as readonly Subscription[])))).flat();
  }
  async unsubscribeSender(subscriptionId: string): Promise<void> {
    const live = await this.connected();
    if (!live.length) return this.mock.unsubscribeSender(subscriptionId);
    await Promise.all(live.map((p) => p.unsubscribeSender(subscriptionId)));
  }

  async health(): Promise<ProviderHealth> {
    const all = await Promise.all(this.real.map((p) => p.health()));
    const checkedAt = Date.now();
    const available = all.filter((h) => h.state === "available");
    if (available.length) return { state: "available", summary: `${available.length} account${available.length === 1 ? "" : "s"} connected`, detail: available.map((h) => h.summary.split(" · ")[0]).join(", "), checkedAt };
    const bad = all.find((h) => h.state === "error" || h.state === "unavailable");
    if (bad) return bad;
    return { state: "not-configured", summary: this.allowDemoFallback ? "No account connected · demo inbox" : "No account connected", detail: "Outlook and Gmail are ready to configure in Integrations.", checkedAt };
  }
}
