import type { Message, MessageCategory } from "@/core/types";
import { classifyMessage } from "@/core/email/classify";

/**
 * Deterministic synthetic mailbox for stress and chaos testing. Nothing here
 * is real: senders are reserved example domains, bodies are generated.
 */
const SENDERS: { sender: string; address: string; subjects: string[]; bulk: boolean; listId?: string; oneClick?: boolean }[] = [
  { sender: "Morning Brew", address: "crew@morningbrew.example", subjects: ["☕ Markets wobble, chips rally", "This week in tech — issue #{n}", "Your Tuesday digest"], bulk: true, listId: "<brew.morningbrew.example>", oneClick: true },
  { sender: "Retailer X Deals", address: "deals@retailerx.example", subjects: ["40% off everything — last chance", "Flash sale: GPUs, monitors, more", "Your exclusive coupon inside"], bulk: true, listId: "<deals.retailerx.example>" },
  { sender: "GitHub", address: "notifications@github.example", subjects: ["[nexus] PR #{n} merged", "[nexus] New issue: layout drift", "Your dependabot digest"], bulk: false },
  { sender: "Steam", address: "noreply@steampowered.example", subjects: ["Thank you for your Steam purchase!", "Your Steam receipt #{n}", "Wishlist item on sale"], bulk: false },
  { sender: "Amazon", address: "ship-confirm@amazon.example", subjects: ["Your order has shipped", "Delivered: your package", "Order confirmation #{n}"], bulk: false },
  { sender: "Chase", address: "alerts@chase.example", subjects: ["Your statement is ready", "Transaction alert", "Payment due reminder"], bulk: false },
  { sender: "Delta", address: "noreply@delta.example", subjects: ["Your itinerary", "Check-in is open", "Boarding pass"], bulk: false },
  { sender: "Alex Chen", address: "alex.chen@gmail.example", subjects: ["Co-op tonight?", "Re: plans", "That clip 😂"], bulk: false },
  { sender: "Sarah K", address: "sarah.k@company.example", subjects: ["URGENT: contract deadline", "Meeting agenda", "Re: Q3 review"], bulk: false },
  { sender: "Microsoft account", address: "account-security-noreply@accountprotection.example", subjects: ["New sign-in from Windows", "Your verification code", "Security alert"], bulk: false },
  { sender: "TechCrunch", address: "newsletters@techcrunch.example", subjects: ["Daily Crunch", "Startups weekly", "The Station"], bulk: true, listId: "<daily.techcrunch.example>", oneClick: true },
  { sender: "Facebook", address: "notification@facebookmail.example", subjects: ["You have 3 new notifications", "Someone mentioned you"], bulk: true },
  { sender: "Medium Daily Digest", address: "noreply@medium.example", subjects: ["Stories for you", "Highlights from writers you follow"], bulk: true, listId: "<digest.medium.example>", oneClick: true },
  { sender: "Vercel", address: "notifications@vercel.example", subjects: ["Deployment ready", "Build failed on main"], bulk: false },
  // Hostile senders: malformed / unicode / very long
  { sender: "   ", address: "@broken", subjects: ["(no subject)"], bulk: false },
  { sender: "Ünïcödé Ñews 🎉", address: "news@ünïcode.example", subjects: ["Wöchentliche Zusammenfassung — Ausgabe #{n}", "🎉 Nyheter fra oss"], bulk: true, listId: "<news.xn--nicode-3ya.example>" },
  { sender: "A".repeat(140), address: `${"very-long-local-part".repeat(6)}@long.example`, subjects: ["L".repeat(400)], bulk: true },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export interface SyntheticMailOptions {
  count: number;
  accountId?: string;
  provider?: "gmail" | "outlook";
  slot?: number;
  /** Adds a single conversation with this many messages (huge thread). */
  hugeThread?: number;
  now?: number;
}

export function syntheticMessages(opts: SyntheticMailOptions): Message[] {
  const now = opts.now ?? Date.now();
  const provider = opts.provider ?? "gmail";
  const slot = opts.slot ?? 1;
  const accountId = opts.accountId ?? `acct-${provider}-${slot}`;
  const prefix = slot === 1 ? `${provider}:` : `${provider}:${slot}:`;
  const r = rng(opts.count * 7 + slot);
  const out: Message[] = [];
  for (let i = 0; i < opts.count; i++) {
    const s = SENDERS[Math.floor(r() * SENDERS.length)]!;
    const subject = s.subjects[Math.floor(r() * s.subjects.length)]!.replace("#{n}", String(1000 + i));
    const timestamp = now - Math.floor(r() * 365 * 86400_000);
    const read = r() < (s.bulk ? 0.25 : 0.7);
    const listUnsubscribe = s.bulk ? `<https://${s.address.split("@")[1]}/unsubscribe/${i}>${s.oneClick ? "" : ", <mailto:unsub@" + s.address.split("@")[1] + ">"}` : null;
    const c = classifyMessage({ sender: s.sender, senderAddress: s.address, subject, preview: "", listUnsubscribe, listId: s.listId ?? null, listUnsubscribePost: !!s.oneClick } as Parameters<typeof classifyMessage>[0]);
    out.push({
      id: `${prefix}syn-${i}`,
      rawId: `syn-${i}`,
      accountId,
      sender: s.sender,
      senderAddress: s.address,
      subject,
      preview: `Synthetic message ${i} from ${s.sender}.`,
      body: `Synthetic body ${i}.\n\nThis message was generated for stress testing and contains no real content.`,
      timestamp,
      read,
      archived: false,
      category: c.category,
      canUnsubscribe: !!listUnsubscribe,
      signals: c.signals,
      listUnsubscribe,
      listUnsubscribePost: !!s.oneClick,
      listId: s.listId ?? null,
      threadId: `t-${Math.floor(i / 3)}`,
      hasAttachments: r() < 0.12,
      starred: r() < 0.04,
      sizeBytes: provider === "gmail" ? Math.floor(4000 + r() * 120_000) : null,
    });
  }
  if (opts.hugeThread) {
    for (let k = 0; k < opts.hugeThread; k++) {
      out.push({ id: `${prefix}thread-${k}`, rawId: `thread-${k}`, accountId, sender: k % 2 ? "Alex Chen" : "Joseph", senderAddress: k % 2 ? "alex.chen@gmail.example" : "me@example.com", subject: "Re: the never-ending thread", preview: `Reply ${k}`, body: `Reply ${k}`, timestamp: now - (opts.hugeThread - k) * 3_600_000, read: k < opts.hugeThread - 3, archived: false, category: "personal", canUnsubscribe: false, threadId: "t-huge", signals: ["looks like a person"] });
    }
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

export const SYNTHETIC_CATEGORY_HINT: Partial<Record<MessageCategory, string>> = {};
