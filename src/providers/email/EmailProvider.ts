import type { EmailAccount, InboxSummary, Message, ProviderHealth, Subscription } from "@/core/types";

/**
 * Abstraction over communications sources: MockEmailProvider (demo),
 * RealMailProvider (Outlook via Microsoft Graph, Gmail via Gmail API) and the
 * unifying EmailAutoProvider. Tokens live in the OS credential store and are
 * injected natively. Classification is heuristic, explainable, and never
 * presented as AI certainty.
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
  health?(): Promise<ProviderHealth>;
}
