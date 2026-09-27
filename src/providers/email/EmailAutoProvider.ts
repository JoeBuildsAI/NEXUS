import type { EmailAccount, InboxSummary, Message, ProviderHealth, Subscription } from "@/core/types";
import type { EmailProvider } from "./EmailProvider";
import type { MockEmailProvider } from "./MockEmailProvider";
import type { RealMailProvider } from "./RealMailProvider";

/**
 * Unified inbox over every connected real account, with demo fallback when
 * nothing is connected (labelled as demo by `mode()`).
 */
export class EmailAutoProvider implements EmailProvider {
  readonly id = "auto-email";
  constructor(public readonly real: readonly RealMailProvider[], private mock: MockEmailProvider, private allowDemoFallback: boolean) {}

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
    return this.real.find((p) => messageId.startsWith(`${p.providerId}:`));
  }

  async getAccounts(): Promise<readonly EmailAccount[]> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.getAccounts() : [];
    return (await Promise.all(live.map((p) => p.getAccounts().catch(() => [] as readonly EmailAccount[])))).flat();
  }

  async getMessages(): Promise<readonly Message[]> {
    const live = await this.connected();
    if (!live.length) return this.allowDemoFallback ? this.mock.getMessages() : [];
    const results = await Promise.allSettled(live.map((p) => p.getMessages()));
    const ok = results.filter((r): r is PromiseFulfilledResult<readonly Message[]> => r.status === "fulfilled").flatMap((r) => [...r.value]);
    if (!ok.length && results.some((r) => r.status === "rejected")) throw (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
    return ok.sort((a, b) => b.timestamp - a.timestamp);
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
    if (available.length) return { state: "available", summary: available.map((h) => h.summary.split(" · ")[0]).join(" + ") + " connected", checkedAt };
    const bad = all.find((h) => h.state === "error" || h.state === "unavailable");
    if (bad) return bad;
    return { state: "not-configured", summary: this.allowDemoFallback ? "No account connected · demo inbox" : "No account connected", detail: "Outlook and Gmail are ready to configure in Integrations.", checkedAt };
  }
}
