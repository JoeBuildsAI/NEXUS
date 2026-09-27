import type { EmailAccount, InboxSummary, Message } from "@/core/types";
import { DEMO_ACCOUNTS, DEMO_MESSAGES } from "@/core/demo/emails";
import type { EmailProvider } from "./EmailProvider";

export class MockEmailProvider implements EmailProvider {
  readonly id = "mock-email";
  private messages: Message[] = DEMO_MESSAGES.map((m) => ({ ...m }));

  async getAccounts(): Promise<readonly EmailAccount[]> {
    return DEMO_ACCOUNTS;
  }

  async getMessages(): Promise<readonly Message[]> {
    return this.messages.filter((m) => !m.archived);
  }

  async getSummary(sinceTimestamp: number): Promise<InboxSummary> {
    const recent = this.messages.filter(
      (m) => !m.archived && m.timestamp >= sinceTimestamp,
    );
    const count = (pred: (m: Message) => boolean) => recent.filter(pred).length;
    return {
      total: recent.length,
      unread: count((m) => !m.read),
      important: count((m) => m.category === "important"),
      newsletters: count((m) => m.category === "newsletter"),
      receipts: count((m) => m.category === "receipt"),
      other: count(
        (m) =>
          m.category === "other" ||
          m.category === "social" ||
          m.category === "subscription",
      ),
      sinceTimestamp,
    };
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
    // In mock mode we simply archive and mark handled.
    this.update(messageId, { archived: true, canUnsubscribe: false });
  }
}
