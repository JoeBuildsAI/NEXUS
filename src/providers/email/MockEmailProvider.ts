import type { EmailAccount, InboxSummary, Message, Subscription } from "@/core/types";
import { DEMO_ACCOUNTS, DEMO_MESSAGES, DEMO_SUBSCRIPTIONS, demoIncomingMessage } from "@/core/demo/emails";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";
import type { EmailProvider } from "./EmailProvider";

export class MockEmailProvider implements EmailProvider {
  readonly id = "mock-email";
  private messages: Message[] = DEMO_MESSAGES.map((m) => ({ ...m }));
  private subscriptions: Subscription[] = DEMO_SUBSCRIPTIONS.map((s) => ({ ...s }));
  private seenPulse = 0;

  private guard() {
    if (!useDevStore.getState().emailConnected) {
      throw new ProviderOfflineError("Email", "Email is disconnected (simulated)");
    }
    // Dev panel: inject an incoming message per pulse.
    const pulse = useDevStore.getState().emailPulse;
    while (this.seenPulse < pulse) {
      this.seenPulse += 1;
      this.messages = [demoIncomingMessage(this.seenPulse), ...this.messages];
    }
  }

  async getAccounts(): Promise<readonly EmailAccount[]> {
    return DEMO_ACCOUNTS;
  }

  async getMessages(): Promise<readonly Message[]> {
    this.guard();
    return this.messages.filter((m) => !m.archived);
  }

  async getSummary(sinceTimestamp: number): Promise<InboxSummary> {
    this.guard();
    const recent = this.messages.filter((m) => !m.archived && m.timestamp >= sinceTimestamp);
    const count = (pred: (m: Message) => boolean) => recent.filter(pred).length;
    return {
      total: recent.length,
      unread: count((m) => !m.read),
      important: count((m) => m.category === "important"),
      newsletters: count((m) => m.category === "newsletter"),
      receipts: count((m) => m.category === "receipt"),
      other: count((m) => m.category === "other" || m.category === "social" || m.category === "subscription"),
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
  async unsubscribe(messageId: string): Promise<void> {
    const msg = this.messages.find((m) => m.id === messageId);
    this.update(messageId, { archived: true, canUnsubscribe: false });
    if (msg) {
      this.subscriptions = this.subscriptions.map((s) =>
        s.senderAddress === msg.senderAddress ? { ...s, status: "unsubscribed" } : s,
      );
    }
  }
  async unsubscribeSender(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.find((s) => s.id === subscriptionId);
    this.subscriptions = this.subscriptions.map((s) =>
      s.id === subscriptionId ? { ...s, status: "unsubscribed" } : s,
    );
    if (sub) {
      this.messages = this.messages.map((m) =>
        m.senderAddress === sub.senderAddress ? { ...m, canUnsubscribe: false } : m,
      );
    }
  }
}
