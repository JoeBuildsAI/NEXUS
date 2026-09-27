/** Communications domain models. */

/** "important" = PRIORITY. Classification is heuristic and explainable, never AI certainty. */
export type MessageCategory =
  | "important"
  | "personal"
  | "work"
  | "financial"
  | "purchase"
  | "order"
  | "receipt"
  | "travel"
  | "newsletter"
  | "subscription"
  | "promotion"
  | "notification"
  | "social"
  | "security"
  | "other";

export const MESSAGE_CATEGORIES: readonly MessageCategory[] = ["important", "personal", "work", "financial", "purchase", "order", "receipt", "travel", "newsletter", "subscription", "promotion", "notification", "social", "security", "other"];

export interface EmailAccount {
  readonly id: string;
  readonly address: string;
  readonly displayName: string;
  readonly provider: "gmail" | "outlook" | "imap" | "mock";
  /** User-facing label (e.g. "Personal", "Work"). */
  readonly label?: string;
  /** Provider-reported mailbox totals when available (KNOWN); null = unavailable. */
  readonly totals?: { messages: number | null; unread: number | null } | null;
}

export type EmailConnectionState = "not-configured" | "ready-to-connect" | "connecting" | "connected" | "auth-error" | "offline";

export interface EmailSyncState {
  readonly lastSyncAt: number | null;
  readonly syncing: boolean;
  readonly error: string | null;
  /** Seconds until the provider allows more requests (429). */
  readonly rateLimitedUntil: number | null;
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
  /** Heuristic classification — never presented as AI certainty. */
  readonly category: MessageCategory;
  readonly canUnsubscribe: boolean;
  /** Why the classifier chose the category (short, human-readable signals). */
  readonly signals?: readonly string[];
  /** Raw List-Unsubscribe header value when the provider exposes it. */
  readonly listUnsubscribe?: string | null;
  /** RFC 8058 one-click support ("List-Unsubscribe=One-Click"). */
  readonly listUnsubscribePost?: boolean;
  /** List-Id header (mailing-list identity) when present. */
  readonly listId?: string | null;
  readonly threadId?: string | null;
  readonly hasAttachments?: boolean;
  readonly starred?: boolean;
  /** Provider size estimate in bytes when exposed (Gmail). */
  readonly sizeBytes?: number | null;
  /** Provider raw id (without the NEXUS prefix), for actions. */
  readonly rawId?: string;
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
