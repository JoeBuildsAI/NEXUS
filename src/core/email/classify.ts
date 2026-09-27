import type { MessageCategory } from "@/core/types";

/**
 * Deterministic, explainable message classification (v2). Every decision is a
 * short list of signals a human can read ("List-Unsubscribe header", "order
 * vocabulary", "your rule for acme.example"). No model, no external calls.
 * User rules always win over heuristics.
 */
export interface ClassifyInput {
  senderAddress: string;
  sender: string;
  subject: string;
  preview: string;
  listUnsubscribe?: string | null;
  listId?: string | null;
  /** Provider-side hints: Gmail CATEGORY_* labels (lowercased), "importance:high", "starred". */
  hints?: readonly string[];
  /** The account owner's own domain (work detection); consumer domains are ignored. */
  ownDomain?: string | null;
  /** Thread metadata: the user has replied in this thread before. */
  userReplied?: boolean;
  hasAttachments?: boolean;
}

export interface UserRule {
  /** "domain" matches the sender's domain (and subdomains); "address" matches exactly; "list" matches List-Id. */
  kind: "domain" | "address" | "list";
  value: string;
  category: MessageCategory;
}

export interface Classification {
  category: MessageCategory;
  signals: string[];
  fromRule: boolean;
}

export const CATEGORY_LABEL: Record<MessageCategory, string> = {
  important: "Priority", personal: "Personal", work: "Work", financial: "Financial", purchase: "Purchases", order: "Orders", receipt: "Receipts",
  travel: "Travel", newsletter: "Newsletters", subscription: "Subscriptions", promotion: "Promotions", notification: "Notifications", social: "Social", security: "Security", other: "Other",
};

const CONSUMER_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com"]);
const NOREPLY = /^(no-?reply|noreply|donotreply|do-not-reply|notifications?|alerts?|mailer|bounce|newsletter|news|updates?|marketing|promo|info|hello|team|support|billing|receipts?|orders?|account|security|service|customerservice|store|shop|reservations?|bookings?|tickets?|travel|confirmations?|itinerary|statements?|payments?)[@.+_-]/i;
const SECURITY_WORDS = /\b(verification code|verify your|security alert|new sign-?in|sign-?in attempt|unusual activity|password (?:reset|changed|change)|2fa|two-factor|one-time (?:code|password)|login code|confirm your (?:email|identity)|suspicious)\b/i;
const FINANCIAL_WORDS = /\b(statement (?:is )?(?:ready|available)|account balance|payment (?:due|reminder|failed|declined)|direct deposit|wire transfer|transaction alert|credit (?:card|score|limit)|autopay|minimum payment|your bill|billing statement|tax (?:document|form|return)|1099|w-2|interest rate|mortgage|loan)\b/i;
const ORDER_WORDS = /\b(order (?:confirmation|confirmed|#|no\.?|number|update|placed)|your order|has (?:shipped|been shipped)|out for delivery|delivered|shipping (?:confirmation|update)|tracking (?:number|info)|package|on its way|return (?:started|received))\b/i;
const RECEIPT_WORDS = /\b(receipt|invoice|payment (?:received|confirmation|successful)|thank you for your (?:purchase|payment|order)|you paid|amount paid|paid \$|purchase confirmation|transaction receipt)\b/i;
const PURCHASE_WORDS = /\b(purchase|you bought|pre-?order|subscription (?:renewed|confirmed)|renewal (?:receipt|confirmation))\b/i;
const TRAVEL_STRONG = /\b(itinerary|boarding pass|booking confirmation|reservation confirmed|e-?ticket|flight confirmation)\b/i;
const TRAVEL_WORDS = /\b(itinerary|boarding pass|flight (?:confirmation|details|reminder)|check-?in (?:is )?(?:open|now|reminder)|reservation (?:confirmed|details)|booking (?:confirmation|confirmed|reference)|hotel|confirmation number|e-?ticket|gate|departure|trip)\b/i;
const NEWSLETTER_WORDS = /\b(newsletter|digest|weekly|monthly roundup|this week in|issue #?\d+|edition|what'?s new|recap)\b/i;
const PROMO_WORDS = /\b(\d{1,2}% off|sale|deal|offer|discount|coupon|limited time|free shipping|last chance|save (?:up to|\$|\d)|black friday|cyber monday|flash sale|clearance|exclusive)\b/i;
const NOTIFICATION_WORDS = /\b(reminder|notification|alert|update|has been|was (?:updated|added|created|approved|merged|assigned)|mentioned you|new comment|new message|invited you)\b/i;
const PRIORITY_WORDS = /\b(urgent|asap|deadline|action required|approval needed|final notice|overdue|interview|offer letter|contract|time-?sensitive|response needed|please review)\b/i;
const SOCIAL_DOMAINS = ["facebook.com", "facebookmail.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "reddit.com", "redditmail.com", "discord.com", "tiktok.com", "snapchat.com", "pinterest.com", "youtube.com", "twitch.tv", "threads.net"];
const NOTIFICATION_DOMAINS = ["github.com", "gitlab.com", "atlassian.net", "slack.com", "steampowered.com", "microsoft.com", "google.com", "apple.com", "linear.app", "notion.so", "figma.com", "vercel.com", "dropbox.com", "zoom.us", "calendly.com"];
const RECEIPT_DOMAINS = ["paypal.com", "stripe.com", "amazon.com", "amazon.co.uk", "steampowered.com", "apple.com", "digitalriver.com", "gumroad.com", "humblebundle.com", "epicgames.com", "gog.com", "ebay.com", "shopify.com", "squareup.com"];
const FINANCIAL_DOMAINS = ["chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com", "amex.com", "americanexpress.com", "discover.com", "usbank.com", "schwab.com", "fidelity.com", "vanguard.com", "robinhood.com", "coinbase.com", "venmo.com", "wise.com", "revolut.com", "monzo.com", "barclays.co.uk", "hsbc.com", "intuit.com", "mint.com"];
const TRAVEL_DOMAINS = ["delta.com", "united.com", "aa.com", "southwest.com", "jetblue.com", "britishairways.com", "lufthansa.com", "ryanair.com", "easyjet.com", "booking.com", "expedia.com", "airbnb.com", "hotels.com", "marriott.com", "hilton.com", "hyatt.com", "uber.com", "lyft.com", "amtrak.com", "kayak.com", "tripadvisor.com"];

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).toLowerCase().trim() : "";
}
const inDomains = (domain: string, list: readonly string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

export function classifyMessage(input: ClassifyInput, rules: readonly UserRule[] = []): Classification {
  const address = input.senderAddress.toLowerCase().trim();
  const domain = domainOf(address);
  const signals: string[] = [];

  // 1. User rules win.
  const listId = (input.listId ?? "").toLowerCase();
  const rule = rules.find((r) => {
    const v = r.value.toLowerCase();
    if (r.kind === "address") return v === address;
    if (r.kind === "list") return !!listId && listId.includes(v);
    return v === domain || domain.endsWith(`.${v}`);
  });
  if (rule) return { category: rule.category, signals: [`your rule for ${rule.kind === "address" ? address : rule.kind === "list" ? "this list" : domain}`], fromRule: true };

  const subject = input.subject;
  const text = `${subject} ${input.preview}`;
  const hints = (input.hints ?? []).map((h) => h.toLowerCase());
  const bulk = !!input.listUnsubscribe || !!input.listId;
  if (input.listUnsubscribe) signals.push("List-Unsubscribe header");
  if (input.listId) signals.push("mailing-list id");
  const noreply = NOREPLY.test(address);
  if (noreply) signals.push("automated sender");
  const human = !bulk && !noreply && /^[a-z]+([._-][a-z]+)?\d{0,3}@/i.test(address);
  if (hints.includes("importance:high")) signals.push("marked high importance");
  if (input.userReplied) signals.push("you replied in this thread");

  // 2. Security — always surfaced, even from bulk senders.
  if (SECURITY_WORDS.test(subject)) {
    signals.push("security vocabulary");
    return done("security");
  }

  // 3. Priority: human sender + urgency, provider high importance, or a thread you're part of.
  if (hints.includes("importance:high") || (human && (PRIORITY_WORDS.test(subject) || input.userReplied))) {
    if (PRIORITY_WORDS.test(subject)) signals.push("urgent language in subject");
    return done("important");
  }

  // 4. Money & purchases (ordered: receipt ≻ order ≻ purchase ≻ financial).
  const receiptDomain = inDomains(domain, RECEIPT_DOMAINS);
  if (RECEIPT_WORDS.test(text) && (noreply || bulk || receiptDomain || /receipt|invoice|payment/i.test(subject))) {
    signals.push("receipt vocabulary");
    if (receiptDomain) signals.push(`merchant domain: ${domain}`);
    return done("receipt");
  }
  if (ORDER_WORDS.test(subject) || (ORDER_WORDS.test(text) && (noreply || receiptDomain))) {
    signals.push("order / shipping vocabulary");
    return done("order");
  }
  if (PURCHASE_WORDS.test(subject) && (noreply || receiptDomain)) {
    signals.push("purchase vocabulary");
    return done("purchase");
  }
  if (inDomains(domain, FINANCIAL_DOMAINS) || (FINANCIAL_WORDS.test(text) && (noreply || bulk))) {
    if (inDomains(domain, FINANCIAL_DOMAINS)) signals.push(`financial institution: ${domain}`);
    if (FINANCIAL_WORDS.test(text)) signals.push("financial vocabulary");
    return done("financial");
  }
  if (inDomains(domain, TRAVEL_DOMAINS) || TRAVEL_STRONG.test(subject) || (TRAVEL_WORDS.test(subject) && (noreply || bulk))) {
    if (inDomains(domain, TRAVEL_DOMAINS)) signals.push(`travel provider: ${domain}`);
    if (TRAVEL_WORDS.test(subject)) signals.push("travel vocabulary");
    return done("travel");
  }

  // 5. Work: the account's own (non-consumer) domain, or calendar/meeting mail from a person.
  if (input.ownDomain && !CONSUMER_DOMAINS.has(input.ownDomain) && (domain === input.ownDomain || domain.endsWith(`.${input.ownDomain}`))) {
    signals.push("sent from your organization");
    return done("work");
  }
  if (human && /\b(meeting|invite|invitation|agenda|standup|sync|1:1|review|proposal|contract|quarterly|q[1-4]\b)/i.test(subject)) {
    signals.push("work vocabulary from a person");
    return done("work");
  }

  // 6. Bulk mail: promotions vs newsletters vs subscriptions.
  if (bulk || hints.includes("category_promotions")) {
    if (hints.includes("category_promotions")) signals.push("Gmail: promotions");
    if (PROMO_WORDS.test(text)) {
      signals.push("promotional vocabulary");
      return done("promotion");
    }
    if (NEWSLETTER_WORDS.test(text)) {
      signals.push("newsletter vocabulary");
      return done("newsletter");
    }
    return done(hints.includes("category_promotions") ? "promotion" : "newsletter");
  }

  // 7. Social & notifications from services.
  if (inDomains(domain, SOCIAL_DOMAINS) || hints.includes("category_social")) {
    signals.push(inDomains(domain, SOCIAL_DOMAINS) ? `social network: ${domain}` : "Gmail: social");
    return done("social");
  }
  if (noreply || inDomains(domain, NOTIFICATION_DOMAINS) || NOTIFICATION_WORDS.test(subject) || hints.includes("category_updates")) {
    if (inDomains(domain, NOTIFICATION_DOMAINS)) signals.push(`service domain: ${domain}`);
    if (NOTIFICATION_WORDS.test(subject)) signals.push("notification vocabulary");
    if (hints.includes("category_updates")) signals.push("Gmail: updates");
    return done("notification");
  }

  // 8. Personal: a human-looking sender with none of the above.
  if (human) {
    signals.push("looks like a person");
    return done("personal");
  }
  signals.push("no strong signal");
  return done("other");

  function done(category: MessageCategory): Classification {
    return { category, signals, fromRule: false };
  }
}

/** View groupings used by the inbox tabs (a view may span several categories). */
export const VIEW_CATEGORIES = {
  all: null,
  important: ["important"],
  people: ["personal", "work"],
  purchases: ["purchase", "order"],
  receipts: ["receipt"],
  travel: ["travel"],
  financial: ["financial"],
  subscriptions: ["subscription"],
  newsletters: ["newsletter"],
  notifications: ["notification", "social", "security"],
  promotions: ["promotion"],
} as const satisfies Record<string, readonly MessageCategory[] | null>;
export type InboxView = keyof typeof VIEW_CATEGORIES | "cleanup";

/** Categories that are candidates for bulk cleanup (never people, money, travel or security). */
export const LOW_VALUE_CATEGORIES: readonly MessageCategory[] = ["newsletter", "subscription", "promotion", "notification", "social"];

export interface SummaryCounts {
  total: number;
  unread: number;
  important: number;
  people: number;
  receipts: number;
  purchases: number;
  financial: number;
  travel: number;
  newsletters: number;
  promotions: number;
  notifications: number;
  security: number;
  other: number;
}

/** "Since your last check" counts over messages newer than `since`. */
export function summarize(messages: readonly { timestamp: number; read: boolean; category: MessageCategory }[], since: number): SummaryCounts {
  const recent = messages.filter((m) => m.timestamp >= since);
  const count = (c: readonly MessageCategory[]) => recent.filter((m) => c.includes(m.category)).length;
  return {
    total: recent.length,
    unread: recent.filter((m) => !m.read).length,
    important: count(["important"]),
    people: count(["personal", "work"]),
    receipts: count(["receipt"]),
    purchases: count(["purchase", "order"]),
    financial: count(["financial"]),
    travel: count(["travel"]),
    newsletters: count(["newsletter", "subscription"]),
    promotions: count(["promotion"]),
    notifications: count(["notification", "social"]),
    security: count(["security"]),
    other: count(["other"]),
  };
}
