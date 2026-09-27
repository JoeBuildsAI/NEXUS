import type { MessageCategory } from "@/core/types";

/**
 * Deterministic, explainable message classification. Every decision is a
 * short list of signals a human can read ("List-Unsubscribe header",
 * "sender domain: github.com"). No model, no external calls.
 *
 * User rules (see emailRulesStore) always win over heuristics.
 */
export interface ClassifyInput {
  senderAddress: string;
  sender: string;
  subject: string;
  preview: string;
  listUnsubscribe?: string | null;
  /** Provider-side hints, e.g. Gmail category labels or Graph importance. */
  hints?: readonly string[];
}

export interface UserRule {
  /** "domain" matches the sender's domain; "address" matches exactly. */
  kind: "domain" | "address";
  value: string;
  category: MessageCategory;
}

export interface Classification {
  category: MessageCategory;
  signals: string[];
  fromRule: boolean;
}

const RECEIPT_WORDS = /\b(receipt|invoice|order (?:confirmation|#|no\.?|number)|your order|payment (?:received|confirmation)|purchase|billing statement|transaction|shipped|delivery confirmation)\b/i;
const NEWSLETTER_WORDS = /\b(newsletter|digest|weekly|monthly roundup|this week in|issue #?\d+|edition)\b/i;
const NOTIFICATION_WORDS = /\b(verification code|security alert|sign-in|new login|password (?:reset|changed)|2fa|one-time code|your account|action required|reminder|notification|alert)\b/i;
const PRIORITY_WORDS = /\b(urgent|asap|deadline|action required|approval needed|final notice|payment failed|overdue|interview|offer letter|contract)\b/i;
const NOREPLY = /^(no-?reply|noreply|donotreply|do-not-reply|notifications?|alerts?|mailer|bounce|newsletter|news|updates?|marketing|promo|info|hello|team|support|billing|receipts?|orders?)[@.+-]/i;
const NOTIFICATION_DOMAINS = ["github.com", "gitlab.com", "atlassian.net", "slack.com", "discord.com", "steampowered.com", "microsoft.com", "google.com", "apple.com", "paypal.com", "amazon.com", "twitch.tv", "linear.app", "notion.so"];
const RECEIPT_DOMAINS = ["paypal.com", "stripe.com", "amazon.com", "steampowered.com", "apple.com", "digitalriver.com", "gumroad.com", "humblebundle.com", "epicgames.com", "gog.com"];

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).toLowerCase().trim() : "";
}

export function classifyMessage(input: ClassifyInput, rules: readonly UserRule[] = []): Classification {
  const address = input.senderAddress.toLowerCase().trim();
  const domain = domainOf(address);
  const signals: string[] = [];

  // 1. User rules win.
  const rule = rules.find((r) => (r.kind === "address" ? r.value.toLowerCase() === address : r.value.toLowerCase() === domain || domain.endsWith(`.${r.value.toLowerCase()}`)));
  if (rule) return { category: rule.category, signals: [`your rule for ${rule.kind === "address" ? address : domain}`], fromRule: true };

  const text = `${input.subject} ${input.preview}`;
  const hints = (input.hints ?? []).map((h) => h.toLowerCase());
  const bulk = !!input.listUnsubscribe;
  if (bulk) signals.push("List-Unsubscribe header");
  const noreply = NOREPLY.test(address);
  if (noreply) signals.push("automated sender");

  // 2. Provider hints (Gmail categories, Graph importance).
  if (hints.includes("category_promotions")) signals.push("Gmail: promotions");
  if (hints.includes("category_updates")) signals.push("Gmail: updates");
  if (hints.includes("category_social")) signals.push("Gmail: social");
  if (hints.includes("importance:high")) signals.push("marked high importance");

  // 3. Receipts (strong, specific vocabulary or payment domains + order words).
  if (RECEIPT_WORDS.test(text) && (noreply || bulk || RECEIPT_DOMAINS.some((d) => domain.endsWith(d)) || /order|invoice|receipt|payment/i.test(input.subject))) {
    signals.push("receipt vocabulary");
    return { category: "receipt", signals, fromRule: false };
  }

  // 4. Priority: human sender + urgency, or provider high importance.
  if (hints.includes("importance:high") || (!bulk && !noreply && PRIORITY_WORDS.test(input.subject))) {
    if (PRIORITY_WORDS.test(input.subject)) signals.push("urgent language in subject");
    return { category: "important", signals, fromRule: false };
  }

  // 5. Newsletters / subscriptions: bulk mail.
  if (bulk || hints.includes("category_promotions")) {
    if (NEWSLETTER_WORDS.test(text)) {
      signals.push("newsletter vocabulary");
      return { category: "newsletter", signals, fromRule: false };
    }
    return { category: hints.includes("category_promotions") ? "subscription" : "newsletter", signals, fromRule: false };
  }

  // 6. Notifications: automated senders / known service domains / alert words.
  if (noreply || NOTIFICATION_DOMAINS.some((d) => domain.endsWith(d)) || NOTIFICATION_WORDS.test(input.subject) || hints.includes("category_updates") || hints.includes("category_social")) {
    if (NOTIFICATION_DOMAINS.some((d) => domain.endsWith(d))) signals.push(`service domain: ${domain}`);
    if (NOTIFICATION_WORDS.test(input.subject)) signals.push("notification vocabulary");
    return { category: "notification", signals, fromRule: false };
  }

  // 7. Personal: a human-looking sender with none of the above.
  if (/^[a-z]+(\.[a-z]+)?@/i.test(address) && !noreply) {
    signals.push("looks like a person");
    return { category: "personal", signals, fromRule: false };
  }
  signals.push("no strong signal");
  return { category: "other", signals, fromRule: false };
}

export interface SummaryCounts {
  total: number;
  unread: number;
  important: number;
  newsletters: number;
  receipts: number;
  notifications: number;
  personal: number;
  other: number;
}

/** "Since your last check" counts over messages newer than `since`. */
export function summarize(messages: readonly { timestamp: number; read: boolean; category: MessageCategory }[], since: number): SummaryCounts {
  const recent = messages.filter((m) => m.timestamp >= since);
  const count = (c: MessageCategory[]) => recent.filter((m) => c.includes(m.category)).length;
  return {
    total: recent.length,
    unread: recent.filter((m) => !m.read).length,
    important: count(["important"]),
    newsletters: count(["newsletter", "subscription"]),
    receipts: count(["receipt"]),
    notifications: count(["notification", "social"]),
    personal: count(["personal"]),
    other: count(["other"]),
  };
}
