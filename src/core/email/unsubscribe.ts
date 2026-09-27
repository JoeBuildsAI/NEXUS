/**
 * Safe unsubscribe model. NEXUS never visits links found in message bodies and
 * never sends email. Only standardized metadata is used:
 *   - RFC 8058 one-click (List-Unsubscribe https URL + List-Unsubscribe-Post)
 *     → executed natively as a POST, after URL validation
 *   - https List-Unsubscribe link without one-click → shown for manual review
 *   - mailto-only / nothing → routing-rule fallback (mute + archive)
 */
export type UnsubscribeCapability =
  | "SUPPORTED_NATIVE" // provider API performs it (none of our providers do today)
  | "SUPPORTED_HEADER" // RFC 8058 one-click POST
  | "MANUAL_LINK_ONLY" // https link exists, user opens it deliberately
  | "RULE_FALLBACK" // mailto-only or nothing usable → rule + archive
  | "UNAVAILABLE"
  | "UNKNOWN";

export interface UnsubscribePlan {
  capability: UnsubscribeCapability;
  /** Validated https URL (one-click or manual), if any. */
  url: string | null;
  reason: string;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|169\.254\.)/i;

/** Accept only https URLs to public hostnames without credentials or odd ports. */
export function validateUnsubscribeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!u.hostname.includes(".") || PRIVATE_HOST.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return null;
  if (u.port && u.port !== "443") return null;
  if (raw.length > 2048) return null;
  return u.toString();
}

/** Extract every <…> target from a List-Unsubscribe header. */
export function parseListUnsubscribe(header: string | null | undefined): { https: string[]; mailto: string[] } {
  const https: string[] = [];
  const mailto: string[] = [];
  if (!header) return { https, mailto };
  for (const m of header.matchAll(/<([^>]+)>/g)) {
    const target = m[1]!.trim();
    if (/^mailto:/i.test(target)) mailto.push(target);
    else {
      const ok = validateUnsubscribeUrl(target);
      if (ok) https.push(ok);
    }
  }
  return { https, mailto };
}

export function planUnsubscribe(input: { listUnsubscribe?: string | null; listUnsubscribePost?: boolean; isBulk: boolean }): UnsubscribePlan {
  const { https, mailto } = parseListUnsubscribe(input.listUnsubscribe);
  if (https.length && input.listUnsubscribePost) return { capability: "SUPPORTED_HEADER", url: https[0]!, reason: "One-click unsubscribe (RFC 8058) — NEXUS posts the standard request, nothing else." };
  if (https.length) return { capability: "MANUAL_LINK_ONLY", url: https[0]!, reason: "The sender offers a web unsubscribe page. Open it deliberately; NEXUS will not navigate for you." };
  if (mailto.length) return { capability: "RULE_FALLBACK", url: null, reason: "Only an email unsubscribe address is offered. NEXUS never sends email — a routing rule mutes and archives this sender instead." };
  if (input.isBulk) return { capability: "RULE_FALLBACK", url: null, reason: "No unsubscribe metadata. A routing rule mutes and archives this sender." };
  return { capability: "UNAVAILABLE", url: null, reason: "Not a mailing list; nothing to unsubscribe from." };
}

export interface UnsubscribeLedgerRow {
  key: string;
  sender: string;
  senderAddress: string;
  accountId: string;
  plan: UnsubscribePlan;
  messageCount: number;
}

export interface UnsubscribeLedger {
  rows: UnsubscribeLedgerRow[];
  counts: { header: number; manual: number; rule: number; unavailable: number };
}

/** Summarize a bulk selection before confirmation ("17 selected · 12 one-click · 3 rule · 2 manual"). */
export function buildLedger(rows: UnsubscribeLedgerRow[]): UnsubscribeLedger {
  const counts = { header: 0, manual: 0, rule: 0, unavailable: 0 };
  for (const r of rows) {
    if (r.plan.capability === "SUPPORTED_HEADER" || r.plan.capability === "SUPPORTED_NATIVE") counts.header++;
    else if (r.plan.capability === "MANUAL_LINK_ONLY") counts.manual++;
    else if (r.plan.capability === "RULE_FALLBACK") counts.rule++;
    else counts.unavailable++;
  }
  return { rows, counts };
}
