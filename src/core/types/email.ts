/** Communications domain models. */

export type MessageCategory =
  | "important"
  | "newsletter"
  | "subscription"
  | "receipt"
  | "social"
  | "other";

export interface EmailAccount {
  readonly id: string;
  readonly address: string;
  readonly displayName: string;
  readonly provider: "gmail" | "outlook" | "imap" | "mock";
}

export interface Message {
  readonly id: string;
  readonly accountId: string;
  readonly sender: string;
  readonly senderAddress: string;
  readonly subject: string;
  readonly preview: string;
  readonly body: string;
  readonly timestamp: number;
  readonly read: boolean;
  readonly archived: boolean;
  /** Mock/heuristic classification — never presented as AI certainty. */
  readonly category: MessageCategory;
  readonly canUnsubscribe: boolean;
}

export interface Subscription {
  readonly id: string;
  readonly sender: string;
  readonly senderAddress: string;
  readonly category: "newsletter" | "subscription" | "promotional";
  /** Approximate emails per week. */
  readonly frequencyPerWeek: number;
  readonly lastOpened: number | null;
  readonly status: "active" | "unsubscribed";
}

export interface InboxSummary {
  readonly total: number;
  readonly unread: number;
  readonly important: number;
  readonly newsletters: number;
  readonly receipts: number;
  readonly other: number;
  readonly sinceTimestamp: number;
}
