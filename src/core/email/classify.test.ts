import { describe, expect, it } from "vitest";
import { classifyMessage, domainOf, summarize } from "./classify";

const msg = (o: Partial<Parameters<typeof classifyMessage>[0]>) => classifyMessage({ sender: "x", senderAddress: "x@example.com", subject: "", preview: "", ...o });

describe("email classification v2 (deterministic, explainable)", () => {
  it("receipts and orders from merchants", () => {
    const r = msg({ sender: "Steam", senderAddress: "noreply@steampowered.com", subject: "Thank you for your Steam purchase!", preview: "receipt total $19.99" });
    expect(r.category).toBe("receipt");
    expect(r.signals).toContain("receipt vocabulary");
    expect(msg({ senderAddress: "ship-confirm@amazon.com", subject: "Your order has shipped", preview: "" }).category).toBe("order");
    expect(msg({ senderAddress: "no-reply@store.example", subject: "Your purchase from Studio X", preview: "" }).category).toBe("purchase");
  });

  it("financial institutions and statements", () => {
    expect(msg({ senderAddress: "alerts@chase.com", subject: "Your statement is ready", preview: "" }).category).toBe("financial");
    expect(msg({ senderAddress: "no-reply@somebank.example", subject: "Payment due reminder", preview: "" }).category).toBe("financial");
  });

  it("travel", () => {
    expect(msg({ senderAddress: "noreply@delta.com", subject: "Your itinerary", preview: "" }).category).toBe("travel");
    expect(msg({ senderAddress: "reservations@hotel.example", subject: "Booking confirmation ABC123", preview: "" }).category).toBe("travel");
  });

  it("security alerts win even from bulk senders", () => {
    const r = msg({ senderAddress: "no-reply@accounts.example.com", subject: "New sign-in from Windows", preview: "", listUnsubscribe: "<https://x/u>" });
    expect(r.category).toBe("security");
    expect(msg({ senderAddress: "help@service.example", subject: "Your verification code is 482913", preview: "" }).category).toBe("security");
  });

  it("promotions vs newsletters via bulk headers", () => {
    expect(msg({ senderAddress: "news@shop.example", subject: "40% off everything — last chance", preview: "", listUnsubscribe: "<https://x/u>" }).category).toBe("promotion");
    expect(msg({ senderAddress: "news@hardwareweekly.io", subject: "This week in GPUs — issue #204", preview: "", listUnsubscribe: "<https://x/u>" }).category).toBe("newsletter");
    expect(msg({ senderAddress: "digest@list.example", subject: "Product update", preview: "", listId: "<updates.list.example>" }).category).toBe("newsletter");
  });

  it("priority requires a person + urgency, provider importance, or a thread you replied in", () => {
    expect(msg({ senderAddress: "sarah.k@company.com", subject: "URGENT: contract deadline tomorrow", preview: "" }).category).toBe("important");
    expect(msg({ senderAddress: "promo@shop.example", subject: "URGENT: sale ends tonight", preview: "", listUnsubscribe: "<x>" }).category).not.toBe("important");
    expect(msg({ senderAddress: "boss@company.com", subject: "Notes", preview: "", hints: ["importance:high"] }).category).toBe("important");
    expect(msg({ senderAddress: "alex.chen@gmail.com", subject: "Re: plans", preview: "", userReplied: true }).category).toBe("important");
  });

  it("work: your own organization or meeting vocabulary from a person; consumer domains never count", () => {
    expect(msg({ senderAddress: "cto@acme.io", subject: "Notes", preview: "", ownDomain: "acme.io" }).category).toBe("work");
    expect(msg({ senderAddress: "friend@gmail.com", subject: "hey", preview: "", ownDomain: "gmail.com" }).category).toBe("personal");
    expect(msg({ senderAddress: "pm@client.example", subject: "Meeting agenda for Thursday", preview: "" }).category).toBe("work");
  });

  it("social and notifications", () => {
    expect(msg({ senderAddress: "notification@facebookmail.com", subject: "You have 3 new notifications", preview: "" }).category).toBe("social");
    expect(msg({ senderAddress: "notifications@github.com", subject: "[repo] PR #12 merged", preview: "" }).category).toBe("notification");
  });

  it("personal for human-looking senders with no other signal", () => {
    expect(msg({ senderAddress: "alex.chen@gmail.com", subject: "Co-op tonight?", preview: "We Were Here Too at 9?" }).category).toBe("personal");
  });

  it("user rules override heuristics (domain, address, list) and are explained", () => {
    const rules = [
      { kind: "domain" as const, value: "steampowered.com", category: "notification" as const },
      { kind: "address" as const, value: "alex.chen@gmail.com", category: "important" as const },
      { kind: "list" as const, value: "updates.list.example", category: "promotion" as const },
    ];
    const a = classifyMessage({ sender: "Steam", senderAddress: "noreply@steampowered.com", subject: "Your Steam purchase", preview: "receipt" }, rules);
    expect(a.category).toBe("notification");
    expect(a.fromRule).toBe(true);
    expect(a.signals[0]).toMatch(/your rule/);
    expect(classifyMessage({ sender: "Alex", senderAddress: "Alex.Chen@gmail.com", subject: "hi", preview: "" }, rules).category).toBe("important");
    expect(classifyMessage({ sender: "L", senderAddress: "digest@list.example", subject: "x", preview: "", listId: "<updates.list.example>" }, rules).category).toBe("promotion");
  });

  it("domain matching includes subdomains", () => {
    expect(domainOf("a@mail.example.com")).toBe("mail.example.com");
    const c = classifyMessage({ sender: "x", senderAddress: "a@mail.example.com", subject: "x", preview: "" }, [{ kind: "domain", value: "example.com", category: "receipt" }]);
    expect(c.category).toBe("receipt");
  });

  it("summarizes since a timestamp", () => {
    const now = Date.now();
    const s = summarize(
      [
        { timestamp: now - 1000, read: false, category: "important" },
        { timestamp: now - 2000, read: true, category: "newsletter" },
        { timestamp: now - 3000, read: false, category: "receipt" },
        { timestamp: now - 4000, read: false, category: "order" },
        { timestamp: now - 10 * 86400_000, read: false, category: "receipt" },
      ],
      now - 86400_000,
    );
    expect(s).toMatchObject({ total: 4, unread: 3, important: 1, newsletters: 1, receipts: 1, purchases: 1 });
  });
});
