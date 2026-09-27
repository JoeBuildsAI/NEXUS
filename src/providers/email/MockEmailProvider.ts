import type { EmailAccount, InboxSummary, Message, Subscription } from "@/core/types";
import { DEMO_ACCOUNTS, DEMO_MESSAGES, DEMO_SUBSCRIPTIONS, demoIncomingMessage } from "@/core/demo/emails";
import { syntheticMessages } from "@/core/demo/syntheticMail";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";
import { classifyMessage } from "@/core/email/classify";
import type { CleanupOp } from "@/core/email/cleanup";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import type { EmailProvider } from "./EmailProvider";

/** Demo inbox. Serves pages like a real provider so the UI never assumes "everything is loaded". */
const PAGE = 200;

export class MockEmailProvider implements EmailProvider {
  readonly id = "mock-email";
  private messages: Message[] = DEMO_MESSAGES.map((m) => ({ ...m }));
  private subscriptions: Subscription[] = DEMO_SUBSCRIPTIONS.map((s) => ({ ...s }));
  private seenPulse = 0;
  private syntheticKey = "";
  private served = PAGE;

  private guard() {
    const dev = useDevStore.getState();
    if (!dev.emailConnected) throw new ProviderOfflineError("Email", "Email is disconnected (simulated)");
    if (dev.providerExceptions) throw new Error("Simulated provider exception: email");
    if (dev.emailFailure === "server") throw new Error("Simulated provider error: HTTP 500");
    if (dev.emailFailure === "rate-limit") throw new Error("Simulated provider error: HTTP 429 — retry later");
    if (dev.emailFailure === "auth") throw new Error("Simulated provider error: token expired (401)");
    // Dev panel: inject an incoming message per pulse.
    while (this.seenPulse < dev.emailPulse) {
      this.seenPulse += 1;
      this.messages = [demoIncomingMessage(this.seenPulse), ...this.messages];
    }
    this.ensureSynthetic();
  }

  /** Dev lab: swap in a synthetic mailbox of the requested size (multi-account when large). */
  private ensureSynthetic() {
    const dev = useDevStore.getState();
    const key = `${dev.emailLibrarySize}:${dev.hugeThread}`;
    if (key === this.syntheticKey) return;
    this.syntheticKey = key;
    this.served = PAGE;
    if (!dev.emailLibrarySize && !dev.hugeThread) {
      this.messages = DEMO_MESSAGES.map((m) => ({ ...m }));
      return;
    }
    const half = Math.floor(dev.emailLibrarySize / 2);
    this.messages = [
      ...syntheticMessages({ count: dev.emailLibrarySize - half, provider: "gmail", slot: 1, accountId: "acct-demo-gmail", hugeThread: dev.hugeThread ? 400 : 0 }),
      ...syntheticMessages({ count: half, provider: "outlook", slot: 1, accountId: "acct-demo-outlook" }),
    ].sort((a, b) => b.timestamp - a.timestamp);
  }

  async getAccounts(): Promise<readonly EmailAccount[]> {
    const dev = useDevStore.getState();
    if (dev.emailLibrarySize) {
      return [
        { id: "acct-demo-gmail", address: "joseph@gmail.example", displayName: "Joseph (Gmail)", provider: "gmail", label: "Personal", totals: { messages: Math.ceil(dev.emailLibrarySize / 2), unread: null } },
        { id: "acct-demo-outlook", address: "joseph@outlook.example", displayName: "Joseph (Outlook)", provider: "outlook", label: "Work", totals: { messages: Math.floor(dev.emailLibrarySize / 2), unread: Math.floor(dev.emailLibrarySize / 8) } },
      ];
    }
    return DEMO_ACCOUNTS;
  }

  /** Demo messages run through the same explainable classifier (and user rules) as real mail. */
  private classified(list: readonly Message[]): Message[] {
    const rules = useEmailRulesStore.getState().rules;
    return list.filter((m) => !m.archived).map((m) => {
      const listUnsubscribe = m.listUnsubscribe ?? (m.canUnsubscribe ? `<https://${m.senderAddress.split("@")[1] ?? "demo.example"}/unsubscribe>` : null);
      const c = classifyMessage({ sender: m.sender, senderAddress: m.senderAddress, subject: m.subject, preview: m.preview, listUnsubscribe, listId: m.listId, hints: m.category === "important" && !m.signals ? ["importance:high"] : [] }, rules);
      return { ...m, category: c.category, signals: c.signals, listUnsubscribe, listUnsubscribePost: m.listUnsubscribePost ?? (m.canUnsubscribe && m.senderAddress.length % 2 === 0) };
    });
  }

  async getMessages(): Promise<readonly Message[]> {
    this.guard();
    return this.classified(this.messages.slice(0, this.served));
  }

  async loadOlder(): Promise<number> {
    this.guard();
    const before = Math.min(this.served, this.messages.length);
    this.served = Math.min(this.messages.length, this.served + PAGE);
    return this.served - before;
  }
  hasMore(): boolean {
    return this.served < this.messages.length;
  }

  async search(query: string): Promise<readonly Message[]> {
    this.guard();
    const q = query.toLowerCase();
    return this.classified(this.messages.filter((m) => m.subject.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q) || m.senderAddress.includes(q)).slice(0, 100));
  }

  async getSummary(sinceTimestamp: number): Promise<InboxSummary> {
    this.guard();
    const recent = this.classified(this.messages.slice(0, this.served)).filter((m) => m.timestamp >= sinceTimestamp);
    const count = (pred: (m: Message) => boolean) => recent.filter(pred).length;
    return {
      total: recent.length,
      unread: count((m) => !m.read),
      important: count((m) => m.category === "important"),
      newsletters: count((m) => m.category === "newsletter" || m.category === "subscription"),
      receipts: count((m) => m.category === "receipt"),
      other: count((m) => !["important", "newsletter", "subscription", "receipt"].includes(m.category)),
      sinceTimestamp,
    };
  }

  async getSubscriptions(): Promise<readonly Subscription[]> {
    this.guard();
    return this.subscriptions;
  }

  private update(id: string, patch: Partial<Message>) {
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    this.update(messageId, { read });
  }
  async archive(messageId: string): Promise<void> {
    this.update(messageId, { archived: true });
  }
  async delete(messageId: string): Promise<void> {
    this.messages = this.messages.filter((m) => m.id !== messageId);
  }
  async batch(accountId: string, messageIds: string[], op: CleanupOp): Promise<{ succeeded: number; failed: number; error?: string }> {
    const dev = useDevStore.getState();
    const ids = new Set(messageIds);
    const owned = this.messages.filter((m) => ids.has(m.id) && m.accountId === accountId).length;
    if (owned !== messageIds.length) return { succeeded: 0, failed: messageIds.length, error: "ids belong to another account" };
    // Chaos: partial failure — the last 7 of any batch fail when enabled.
    const failN = dev.emailPartialFailure ? Math.min(7, messageIds.length) : 0;
    const okIds = new Set(messageIds.slice(0, messageIds.length - failN));
    if (op === "trash") this.messages = this.messages.filter((m) => !okIds.has(m.id));
    else if (op === "archive") this.messages = this.messages.map((m) => (okIds.has(m.id) ? { ...m, archived: true } : m));
    else this.messages = this.messages.map((m) => (okIds.has(m.id) ? { ...m, read: true } : m));
    return { succeeded: okIds.size, failed: failN, error: failN ? "simulated partial failure (HTTP 503)" : undefined };
  }
  async unsubscribe(messageId: string): Promise<void> {
    const msg = this.messages.find((m) => m.id === messageId);
    this.update(messageId, { archived: true, canUnsubscribe: false });
    if (msg) this.subscriptions = this.subscriptions.map((s) => (s.senderAddress === msg.senderAddress ? { ...s, status: "unsubscribed" } : s));
  }
  async unsubscribeSender(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.find((s) => s.id === subscriptionId);
    this.subscriptions = this.subscriptions.map((s) => (s.id === subscriptionId ? { ...s, status: "unsubscribed" } : s));
    if (sub) this.messages = this.messages.map((m) => (m.senderAddress === sub.senderAddress ? { ...m, canUnsubscribe: false } : m));
  }
}
