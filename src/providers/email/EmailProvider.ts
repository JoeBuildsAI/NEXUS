import type { EmailAccount, InboxSummary, Message, Subscription } from "@/core/types";

/**
 * Abstraction over communications sources. Real adapters (Gmail, Microsoft
 * Graph) come later; credentials must use OS secure storage and never be
 * committed. Classification is heuristic and must never be presented as AI
 * certainty.
 */
export interface EmailProvider {
  readonly id: string;
  getAccounts(): Promise<readonly EmailAccount[]>;
  getMessages(): Promise<readonly Message[]>;
  getSummary(sinceTimestamp: number): Promise<InboxSummary>;
  markRead(messageId: string, read: boolean): Promise<void>;
  archive(messageId: string): Promise<void>;
  delete(messageId: string): Promise<void>;
  unsubscribe(messageId: string): Promise<void>;
  getSubscriptions(): Promise<readonly Subscription[]>;
  unsubscribeSender(subscriptionId: string): Promise<void>;
}
