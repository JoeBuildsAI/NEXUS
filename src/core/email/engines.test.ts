import { describe, expect, it } from "vitest";
import type { EmailAccount, Message } from "@/core/types";
import { buildLedger, parseListUnsubscribe, planUnsubscribe, validateUnsubscribeUrl } from "./unsubscribe";
import { folderName, matchesRule, previewMatches, ruleFromMessage, translateGmail, translateOutlook } from "./rules";
import { approvedTotals, executeBatches, planBatches, proposeCleanup } from "./cleanup";
import { analyzeInbox } from "./health";

const now = 1_700_000_000_000;
const DAY = 86400_000;
let n = 0;
const m = (o: Partial<Message>): Message => ({
  id: `m${++n}`, accountId: "acct-gmail-1", sender: "Sender", senderAddress: "news@list.example", subject: "Subject", preview: "", body: "", timestamp: now - DAY,
  read: false, archived: false, category: "newsletter", canUnsubscribe: false, ...o,
});

describe("unsubscribe safety model", () => {
  it("validates only public https URLs without credentials or odd ports", () => {
    expect(validateUnsubscribeUrl("https://lists.example.com/u?x=1")).toBe("https://lists.example.com/u?x=1");
    expect(validateUnsubscribeUrl("http://lists.example.com/u")).toBeNull();
    expect(validateUnsubscribeUrl("https://user:pw@lists.example.com/u")).toBeNull();
    expect(validateUnsubscribeUrl("https://127.0.0.1/u")).toBeNull();
    expect(validateUnsubscribeUrl("https://10.0.0.5/u")).toBeNull();
    expect(validateUnsubscribeUrl("https://localhost/u")).toBeNull();
    expect(validateUnsubscribeUrl("https://lists.example.com:8443/u")).toBeNull();
    expect(validateUnsubscribeUrl("javascript:alert(1)")).toBeNull();
    expect(validateUnsubscribeUrl("not a url")).toBeNull();
  });
  it("parses List-Unsubscribe headers into https and mailto targets", () => {
    const r = parseListUnsubscribe("<mailto:unsub@list.example?subject=x>, <https://list.example/unsub/abc>");
    expect(r.mailto).toHaveLength(1);
    expect(r.https).toEqual(["https://list.example/unsub/abc"]);
    expect(parseListUnsubscribe(null)).toEqual({ https: [], mailto: [] });
  });
  it("chooses the safest capability", () => {
    expect(planUnsubscribe({ listUnsubscribe: "<https://l.example/u>", listUnsubscribePost: true, isBulk: true }).capability).toBe("SUPPORTED_HEADER");
    expect(planUnsubscribe({ listUnsubscribe: "<https://l.example/u>", listUnsubscribePost: false, isBulk: true }).capability).toBe("MANUAL_LINK_ONLY");
    expect(planUnsubscribe({ listUnsubscribe: "<mailto:u@l.example>", isBulk: true }).capability).toBe("RULE_FALLBACK");
    expect(planUnsubscribe({ listUnsubscribe: "<http://insecure.example/u>", listUnsubscribePost: true, isBulk: true }).capability).toBe("RULE_FALLBACK");
    expect(planUnsubscribe({ isBulk: false }).capability).toBe("UNAVAILABLE");
  });
  it("builds the review ledger counts", () => {
    const row = (cap: ReturnType<typeof planUnsubscribe>["capability"]) => ({ key: cap, sender: "s", senderAddress: "s@x", accountId: "a", messageCount: 1, plan: { capability: cap, url: null, reason: "" } });
    const l = buildLedger([row("SUPPORTED_HEADER"), row("SUPPORTED_HEADER"), row("RULE_FALLBACK"), row("MANUAL_LINK_ONLY"), row("UNAVAILABLE")]);
    expect(l.counts).toEqual({ header: 2, manual: 1, rule: 1, unavailable: 1 });
  });
});

describe("routing rule translation", () => {
  const rule = { condition: { domain: "netflix.com" }, action: { fileTo: "subscription" as const, archive: true, markRead: true, star: true } };
  it("Gmail: labels by id, INBOX/UNREAD removal, no enable/disable", () => {
    const t = translateGmail(rule, { [folderName("subscription")]: "Label_7" });
    expect(t.payload).toEqual({ criteria: { query: "from:netflix.com" }, action: { addLabelIds: ["Label_7", "STARRED"], removeLabelIds: ["UNREAD", "INBOX"] } });
    expect(t.capabilities.enableDisable.supported).toBe(false);
    expect(t.viable).toBe(true);
    expect(t.describe).toMatch(/Anything from netflix.com → NEXUS\/Subscription/);
  });
  it("Gmail: missing label is reported as 'will be created', not dropped", () => {
    const t = translateGmail(rule, {});
    expect(t.capabilities.fileTo.note).toMatch(/created first/);
  });
  it("Outlook: folder move, markAsRead, star unsupported (flag instead), enable/disable supported", () => {
    const t = translateOutlook({ ...rule, name: "Netflix" }, { [folderName("subscription")]: "AAMk1" });
    const p = t.payload as { conditions: Record<string, unknown>; actions: Record<string, unknown>; isEnabled: boolean };
    expect(p.conditions).toEqual({ senderContains: ["@netflix.com"] });
    expect(p.actions).toEqual({ moveToFolder: "AAMk1", markAsRead: true, markImportance: "high" });
    expect(t.capabilities.star.supported).toBe(false);
    expect(t.capabilities.enableDisable.supported).toBe(true);
    expect(p.isEnabled).toBe(true);
  });
  it("previews local matches by domain/address/list and never matches an empty condition", () => {
    const msgs = [m({ senderAddress: "info@netflix.com" }), m({ senderAddress: "x@mail.netflix.com" }), m({ senderAddress: "y@other.example", listId: "<dev.list.example>" })];
    expect(previewMatches(msgs, { domain: "netflix.com" })).toBe(2);
    expect(previewMatches(msgs, { from: "info@netflix.com" })).toBe(1);
    expect(previewMatches(msgs, { listId: "dev.list.example" })).toBe(1);
    expect(matchesRule(msgs[0]!, {})).toBe(false);
  });
  it("suggests a rule from a message", () => {
    const r = ruleFromMessage(m({ sender: "Netflix", senderAddress: "info@netflix.com" }), "subscription");
    expect(r.condition).toEqual({ domain: "netflix.com" });
    expect(r.action.archive).toBe(true);
    expect(ruleFromMessage(m({ senderAddress: "a@b.example" }), "receipt").action.archive).toBe(false);
  });
});

describe("cleanup transactions", () => {
  const msgs = [
    ...Array.from({ length: 5 }, (_, i) => m({ senderAddress: "promo@shop.example", category: "promotion", timestamp: now - (40 + i) * DAY, read: i % 2 === 0 })),
    ...Array.from({ length: 3 }, (_, i) => m({ senderAddress: "news@weekly.example", category: "newsletter", timestamp: now - (35 + i) * DAY })),
    m({ senderAddress: "news@weekly.example", category: "newsletter", timestamp: now - 2 * DAY }), // recent: excluded
    m({ senderAddress: "mom@gmail.com", category: "personal", timestamp: now - 90 * DAY }), // people: never proposed
    m({ senderAddress: "bank@chase.com", category: "financial", timestamp: now - 90 * DAY }), // money: never proposed
    m({ senderAddress: "lonely@list.example", category: "notification", timestamp: now - 60 * DAY }), // below minGroup
    m({ senderAddress: "o@outlook-list.example", accountId: "acct-outlook-1", category: "promotion", timestamp: now - 60 * DAY }),
    m({ senderAddress: "o@outlook-list.example", accountId: "acct-outlook-1", category: "promotion", timestamp: now - 61 * DAY }),
  ];
  it("proposes only aged low-value groups, per account, largest first", () => {
    const plan = proposeCleanup(msgs, { now });
    expect(plan.groups.map((g) => [g.senderAddress, g.messageIds.length])).toEqual([["promo@shop.example", 5], ["news@weekly.example", 3], ["o@outlook-list.example", 2]]);
    expect(plan.groups.every((g) => !g.approved)).toBe(true);
    expect(plan.groups[0]!.reversibility).toBe("recoverable");
    expect(plan.groups.some((g) => g.senderAddress === "mom@gmail.com" || g.senderAddress === "bank@chase.com")).toBe(false);
  });
  it("nothing executes without approval; batches respect provider limits per account", () => {
    const plan = proposeCleanup(msgs, { now });
    expect(planBatches(plan, () => "gmail")).toEqual([]);
    plan.groups.forEach((g) => (g.approved = true));
    const batches = planBatches(plan, (a) => (a.startsWith("acct-outlook") ? "outlook" : "gmail"));
    expect(batches.map((b) => [b.accountId, b.messageIds.length])).toEqual([["acct-gmail-1", 8], ["acct-outlook-1", 2]]);
    expect(approvedTotals(plan)).toEqual({ groups: 3, messages: 10, unread: 7 });
  });
  it("splits large approvals at the provider batch limit", () => {
    const many = Array.from({ length: 45 }, () => m({ accountId: "acct-outlook-1", senderAddress: "bulk@x.example", category: "promotion", timestamp: now - 60 * DAY }));
    const plan = proposeCleanup(many, { now });
    plan.groups[0]!.approved = true;
    const batches = planBatches(plan, () => "outlook");
    expect(batches.map((b) => b.messageIds.length)).toEqual([20, 20, 5]);
  });
  it("reports partial failure honestly", async () => {
    const plan = proposeCleanup(msgs, { now });
    plan.groups.forEach((g) => (g.approved = true));
    const batches = planBatches(plan, () => "outlook");
    let i = 0;
    const report = await executeBatches(batches, async (b) => {
      i++;
      if (i === 2) throw new Error("429 rate limited");
      return { succeeded: b.messageIds.length - 1, failed: 1 };
    });
    expect(report.requested).toBe(10);
    expect(report.succeeded + report.failed).toBe(10);
    expect(report.failed).toBeGreaterThan(0);
    expect(report.results.find((r) => r.error)?.error).toMatch(/429/);
  });
});

describe("inbox health", () => {
  const accounts: EmailAccount[] = [{ id: "acct-gmail-1", address: "j@example.com", displayName: "J", provider: "gmail", totals: { messages: 18492, unread: 3204 } }];
  const msgs = [
    ...Array.from({ length: 6 }, (_, i) => m({ senderAddress: "news@weekly.example", listId: "<weekly.example>", listUnsubscribe: "<https://weekly.example/u>", listUnsubscribePost: true, timestamp: now - i * 7 * DAY })),
    ...Array.from({ length: 4 }, (_, i) => m({ senderAddress: "promo@shop.example", category: "promotion", listUnsubscribe: "<mailto:u@shop.example>", timestamp: now - (i + 1) * 3 * DAY, read: true })),
    m({ senderAddress: "alex@gmail.com", category: "personal", read: true, timestamp: now - DAY }),
    m({ senderAddress: "old@promo.example", category: "promotion", timestamp: now - 45 * DAY }),
  ];
  it("labels provider totals KNOWN and never invents storage figures", () => {
    const h = analyzeInbox(msgs, accounts, { now });
    expect(h.messages).toMatchObject({ value: 18492, confidence: "KNOWN" });
    expect(h.unread).toMatchObject({ value: 3204, confidence: "KNOWN" });
    expect(h.size.confidence).toBe("UNAVAILABLE");
    expect(h.size.value).toBeNull();
  });
  it("falls back to ESTIMATED when totals are missing", () => {
    const h = analyzeInbox(msgs, [{ ...accounts[0]!, totals: null }], { now });
    expect(h.messages.confidence).toBe("ESTIMATED");
    expect(h.messages.value).toBe(msgs.length);
  });
  it("finds recurring lists, cadence, inactive lists and unsubscribe capability", () => {
    const h = analyzeInbox(msgs, accounts, { now });
    const weekly = h.senders.find((s) => s.senderAddress === "news@weekly.example")!;
    expect(weekly.isList).toBe(true);
    expect(weekly.perWeek).toBeCloseTo(1.2, 1);
    expect(weekly.unsubscribe).toBe("SUPPORTED_HEADER");
    expect(h.inactiveLists.map((s) => s.senderAddress)).toContain("news@weekly.example");
    const promo = h.senders.find((s) => s.senderAddress === "promo@shop.example")!;
    expect(promo.unsubscribe).toBe("RULE_FALLBACK");
    expect(h.inactiveLists.map((s) => s.senderAddress)).not.toContain("promo@shop.example"); // all read
    expect(h.lists.value).toBeGreaterThanOrEqual(2);
    expect(h.lowValue.value).toBe(2); // the 45-day promo + the 35-day newsletter issue
    expect(h.lowValueIds).toHaveLength(2);
  });
  it("never exposes message subjects or bodies in sender stats", () => {
    const h = analyzeInbox(msgs, accounts, { now });
    const json = JSON.stringify(h.senders);
    expect(json).not.toContain("Subject");
  });
});
