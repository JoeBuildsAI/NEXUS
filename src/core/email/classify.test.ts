import { describe, expect, it } from "vitest";
import { classifyMessage, domainOf, summarize } from "./classify";

describe("email classification (deterministic, explainable)", () => {
  it("receipts", () => {
    const c = classifyMessage({ sender: "Steam", senderAddress: "noreply@steampowered.com", subject: "Thank you for your Steam purchase!", preview: "Order confirmation #123 total $19.99" });
    expect(c.category).toBe("receipt");
    expect(c.signals.join(" ")).toMatch(/receipt vocabulary/);
  });

  it("newsletters via List-Unsubscribe", () => {
    const c = classifyMessage({ sender: "Hardware Weekly", senderAddress: "news@hardwareweekly.io", subject: "This week in GPUs — issue #204", preview: "…", listUnsubscribe: "<mailto:unsub@hardwareweekly.io>" });
    expect(c.category).toBe("newsletter");
    expect(c.signals).toContain("List-Unsubscribe header");
  });

  it("priority only for human senders with urgency, or provider high importance", () => {
    expect(classifyMessage({ sender: "Sarah", senderAddress: "sarah.k@company.com", subject: "URGENT: contract deadline tomorrow", preview: "" }).category).toBe("important");
    expect(classifyMessage({ sender: "Promo", senderAddress: "promo@shop.example", subject: "URGENT: sale ends tonight", preview: "", listUnsubscribe: "<x>" }).category).not.toBe("important");
    expect(classifyMessage({ sender: "Boss", senderAddress: "boss@company.com", subject: "Notes", preview: "", hints: ["importance:high"] }).category).toBe("important");
  });

  it("notifications from services and automated senders", () => {
    expect(classifyMessage({ sender: "GitHub", senderAddress: "notifications@github.com", subject: "[repo] PR #12 merged", preview: "" }).category).toBe("notification");
    expect(classifyMessage({ sender: "Security", senderAddress: "no-reply@accounts.example.com", subject: "New sign-in from Windows", preview: "" }).category).toBe("notification");
  });

  it("personal for human-looking senders with no other signal", () => {
    expect(classifyMessage({ sender: "Alex", senderAddress: "alex.chen@gmail.com", subject: "Co-op tonight?", preview: "We Were Here Too at 9?" }).category).toBe("personal");
  });

  it("user rules override heuristics and are explained", () => {
    const rules = [{ kind: "domain" as const, value: "steampowered.com", category: "notification" as const }, { kind: "address" as const, value: "alex.chen@gmail.com", category: "important" as const }];
    const a = classifyMessage({ sender: "Steam", senderAddress: "noreply@steampowered.com", subject: "Your Steam purchase", preview: "receipt" }, rules);
    expect(a.category).toBe("notification");
    expect(a.fromRule).toBe(true);
    expect(a.signals[0]).toMatch(/your rule/);
    expect(classifyMessage({ sender: "Alex", senderAddress: "Alex.Chen@gmail.com", subject: "hi", preview: "" }, rules).category).toBe("important");
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
        { timestamp: now - 10 * 86400_000, read: false, category: "receipt" },
      ],
      now - 86400_000,
    );
    expect(s).toMatchObject({ total: 3, unread: 2, important: 1, newsletters: 1, receipts: 1 });
  });
});
