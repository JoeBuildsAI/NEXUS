import { beforeEach, describe, expect, it } from "vitest";
import { RealMailProvider } from "./RealMailProvider";
import { FixtureMailBridge, ok } from "./MailBridge";
import { outlookAdapter, gmailAdapter } from "./adapters";
import { EmailAutoProvider } from "./EmailAutoProvider";
import { MockEmailProvider } from "./MockEmailProvider";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import type { MailAccountSlot } from "@/state/emailAccountsStore";

const ADAPTERS = { outlook: outlookAdapter, gmail: gmailAdapter };
const slots = (...list: ["outlook" | "gmail", number][]): MailAccountSlot[] => list.map(([provider, slot]) => ({ id: `acct-${provider}-${slot}`, provider, slot, label: `${provider} ${slot}`, address: null, addedAt: 0 }));

const graphInbox = ok({
  value: [
    { id: "m1", subject: "Your invoice", bodyPreview: "Invoice #1", from: { emailAddress: { name: "Acme", address: "billing@acme.example" } }, receivedDateTime: "2026-09-26T10:00:00Z", isRead: false, internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<https://acme.example/u>" }] },
    { id: "m2", subject: "Lunch?", from: { emailAddress: { name: "Sarah", address: "sarah.kim@friends.example" } }, receivedDateTime: "2026-09-26T09:00:00Z", isRead: true },
  ],
});

function outlook(state: Partial<{ clientConfigured: boolean; connected: boolean; pending: boolean }> = {}, responses = {}) {
  const bridge = new FixtureMailBridge({ provider: "outlook", clientConfigured: true, connected: true, pending: false, ...state }, {
    "GET /me?": ok({ mail: "joseph@outlook.com", displayName: "Joseph" }),
    "GET /me/mailFolders/inbox/messages": graphInbox,
    "PATCH /me/messages/": ok({}),
    "POST /me/messages/": ok({}),
    "DELETE /me/messages/": ok(""),
    ...responses,
  });
  return { bridge, provider: new RealMailProvider(bridge, outlookAdapter) };
}

describe("RealMailProvider (Outlook / Graph)", () => {
  beforeEach(() => useEmailRulesStore.setState({ rules: [] }));

  it("reports truthful connection states without a client id or token", async () => {
    const a = outlook({ clientConfigured: false, connected: false });
    expect(await a.provider.refreshStatus()).toBe("not-configured");
    expect((await a.provider.health()).summary).toMatch(/ready to configure/);
    const b = outlook({ clientConfigured: true, connected: false });
    expect(await b.provider.refreshStatus()).toBe("ready-to-connect");
    expect(await b.provider.getMessages()).toEqual([]);
  });

  it("syncs profile + inbox once, classifies, and caches within the TTL", async () => {
    const { bridge, provider } = outlook();
    const msgs = await provider.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.category).toBe("receipt");
    expect(msgs[1]!.category).toBe("personal");
    expect((await provider.getAccounts())[0]?.address).toBe("joseph@outlook.com");
    const calls = bridge.calls.length;
    await provider.getMessages();
    expect(bridge.calls.length).toBe(calls); // cached
    expect((await provider.health()).state).toBe("available");
  });

  it("user rules re-classify immediately without a new sync", async () => {
    const { provider } = outlook();
    await provider.getMessages();
    useEmailRulesStore.getState().setRule({ kind: "domain", value: "acme.example", category: "notification" });
    const msgs = await provider.getMessages();
    expect(msgs.find((m) => m.id === "outlook:m1")?.category).toBe("notification");
    expect(msgs.find((m) => m.id === "outlook:m1")?.signals?.[0]).toMatch(/your rule/);
  });

  it("actions are optimistic and hit the right Graph endpoints", async () => {
    const { bridge, provider } = outlook();
    await provider.getMessages();
    await provider.markRead("outlook:m1", true);
    await provider.archive("outlook:m2");
    expect(bridge.calls.some((c) => c.method === "PATCH" && c.path === "/me/messages/m1" && JSON.stringify(c.body).includes("true"))).toBe(true);
    expect(bridge.calls.some((c) => c.method === "POST" && c.path === "/me/messages/m2/move")).toBe(true);
    expect((await provider.getMessages()).some((m) => m.id === "outlook:m2")).toBe(false);
  });

  it("unsubscribe records a domain rule and archives; never opens mailto", async () => {
    const { provider } = outlook();
    await provider.getMessages();
    await provider.unsubscribe("outlook:m1");
    expect(useEmailRulesStore.getState().rules).toContainEqual({ kind: "domain", value: "acme.example", category: "subscription" });
    expect((await provider.getMessages()).some((m) => m.id === "outlook:m1")).toBe(false);
  });

  it("derives subscriptions from bulk senders", async () => {
    const { provider } = outlook();
    const subs = await provider.getSubscriptions();
    expect(subs).toHaveLength(1);
    expect(subs[0]!.senderAddress).toBe("billing@acme.example");
  });

  it("rate limiting and auth errors surface as typed states, not crashes", async () => {
    const rl = outlook({}, { "GET /me/mailFolders/inbox/messages": { status: "rate-limited", httpStatus: 429, body: "", retryAfterSecs: 30 } });
    await rl.provider.syncNow(true);
    expect(rl.provider.syncState().error).toBe("rate-limited");
    expect(rl.provider.syncState().rateLimitedUntil).toBeGreaterThan(Date.now());
    const auth = outlook({}, { "GET /me?": { status: "auth-error", httpStatus: 401, body: "", retryAfterSecs: null } });
    await auth.provider.syncNow(true);
    expect(auth.provider.connectionState()).toBe("auth-error");
    expect((await auth.provider.health()).state).toBe("error");
  });

  it("network failure is offline, and cached messages still render", async () => {
    const { bridge, provider } = outlook();
    await provider.getMessages();
    bridge.state = { ...bridge.state };
    (bridge as unknown as { responses: Record<string, unknown> }).responses = { "GET /me/mailFolders/inbox/messages": { status: "network-error", httpStatus: 0, body: "", retryAfterSecs: null } };
    await provider.syncNow(true);
    expect(provider.connectionState()).toBe("offline");
    expect((await provider.getMessages()).length).toBe(2);
  });
});

describe("Gmail adapter", () => {
  it("lists then fetches messages and modifies labels", async () => {
    const bridge = new FixtureMailBridge({ provider: "gmail", clientConfigured: true, connected: true, pending: false }, {
      "GET /users/me/profile": ok({ emailAddress: "joseph@gmail.com" }),
      "GET /users/me/messages?": ok({ messages: [{ id: "g1" }] }),
      "GET /users/me/messages/g1": ok({ id: "g1", snippet: "hey", internalDate: "1758880800000", labelIds: ["UNREAD", "INBOX"], payload: { headers: [{ name: "From", value: "Alex <alex.chen@gmail.com>" }, { name: "Subject", value: "Co-op?" }] } }),
      "POST /users/me/messages/g1/modify": ok({}),
    });
    const provider = new RealMailProvider(bridge, gmailAdapter);
    const msgs = await provider.getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.id).toBe("gmail:g1");
    await provider.markRead("gmail:g1", true);
    expect(bridge.calls.some((c) => c.path === "/users/me/messages/g1/modify" && JSON.stringify(c.body).includes("UNREAD"))).toBe(true);
  });
});

describe("EmailAutoProvider (multi-account)", () => {
  it("serves the demo inbox when nothing is connected and labels it", async () => {
    const bridge = new FixtureMailBridge({ provider: "outlook", clientConfigured: false, connected: false, pending: false });
    const auto = new EmailAutoProvider(bridge, ADAPTERS, new MockEmailProvider(), true, () => slots(["outlook", 1]));
    expect(await auto.mode()).toBe("demo");
    expect((await auto.getMessages()).length).toBeGreaterThan(0);
    expect((await auto.health()).state).toBe("not-configured");
  });

  it("unifies connected accounts and routes actions by id prefix", async () => {
    const { bridge } = outlook();
    const auto = new EmailAutoProvider(bridge, ADAPTERS, new MockEmailProvider(), true, () => slots(["outlook", 1]));
    expect(await auto.mode()).toBe("real");
    const msgs = await auto.getMessages();
    expect(msgs.every((m) => m.id.startsWith("outlook:"))).toBe(true);
    await auto.markRead("outlook:m1", true);
    expect(bridge.calls.some((c) => c.method === "PATCH")).toBe(true);
  });

  it("keeps two Outlook accounts apart: distinct ids, actions hit the right slot, batch refuses foreign ids", async () => {
    const { bridge } = outlook();
    const auto = new EmailAutoProvider(bridge, ADAPTERS, new MockEmailProvider(), true, () => slots(["outlook", 1], ["outlook", 2]));
    const msgs = await auto.getMessages();
    expect(msgs.filter((m) => m.accountId === "acct-outlook-1")).toHaveLength(2);
    expect(msgs.filter((m) => m.accountId === "acct-outlook-2")).toHaveLength(2);
    expect(msgs.some((m) => m.id === "outlook:m1")).toBe(true);
    expect(msgs.some((m) => m.id === "outlook:2:m1")).toBe(true);
    bridge.calls.length = 0;
    await auto.markRead("outlook:2:m1", true);
    expect(bridge.calls.filter((c) => c.method === "PATCH").map((c) => c.slot)).toEqual([2]);
    const r = await auto.batch("acct-outlook-1", ["outlook:2:m1"], "archive");
    expect(r).toMatchObject({ succeeded: 0, failed: 1 });
    const okBatch = await auto.batch("acct-outlook-2", ["outlook:2:m1", "outlook:2:m2"], "archive");
    expect(okBatch).toEqual({ succeeded: 2, failed: 0 });
    expect((await auto.getMessages()).filter((m) => m.accountId === "acct-outlook-2")).toHaveLength(0);
  });

  it("mixed Gmail + Outlook accounts merge newest-first and report both in health", async () => {
    const bridge = new FixtureMailBridge({ provider: "outlook", clientConfigured: true, connected: true, pending: false }, {
      "GET /me?": ok({ mail: "j@outlook.example", displayName: "J" }),
      "GET /me/mailFolders/inbox/messages": graphInbox,
      "GET /me/mailFolders/inbox?": ok({ totalItemCount: 120, unreadItemCount: 7 }),
      "GET /users/me/profile": ok({ emailAddress: "j@gmail.example", messagesTotal: 18492 }),
      "GET /users/me/labels/INBOX": ok({ messagesUnread: 3204 }),
      "GET /users/me/messages?": ok({ messages: [{ id: "g1" }], nextPageToken: null }),
      "GET /users/me/messages/g1": ok({ id: "g1", threadId: "t1", sizeEstimate: 5000, internalDate: String(Date.parse("2026-09-27T10:00:00Z")), labelIds: ["INBOX", "UNREAD"], snippet: "hi", payload: { headers: [{ name: "From", value: "Alex <alex.chen@gmail.example>" }, { name: "Subject", value: "Co-op tonight?" }] } }),
    });
    const auto = new EmailAutoProvider(bridge, ADAPTERS, new MockEmailProvider(), true, () => slots(["outlook", 1], ["gmail", 1]));
    const msgs = await auto.getMessages();
    expect(msgs[0]!.id).toBe("gmail:g1"); // newest
    expect(new Set(msgs.map((m) => m.accountId))).toEqual(new Set(["acct-outlook-1", "acct-gmail-1"]));
    const accounts = await auto.getAccounts();
    expect(accounts.find((a) => a.provider === "gmail")?.totals).toEqual({ messages: 18492, unread: 3204 });
    expect(accounts.find((a) => a.provider === "outlook")?.totals).toEqual({ messages: 120, unread: 7 });
    expect((await auto.health()).summary).toMatch(/2 accounts connected/);
  });
});

describe("RealMailProvider incremental loading and search", () => {
  it("loads the first page, then older pages on demand, and stops when exhausted", async () => {
    let page = 0;
    const bridge = new FixtureMailBridge({ provider: "outlook", clientConfigured: true, connected: true, pending: false }, {
      "GET /me?": ok({ mail: "j@outlook.example", displayName: "J" }),
      "GET /me/mailFolders/inbox?": ok({ totalItemCount: 3, unreadItemCount: 0 }),
      "GET /me/mailFolders/inbox/messages": (path) => {
        page++;
        const older = path.includes("skip=");
        // First page: a full initial window (200) so the initial sync stops; second page: one older message.
        const value = older
          ? [{ id: "old1", subject: "x", from: { emailAddress: { address: "a@b.example" } }, receivedDateTime: "2026-01-01T00:00:00Z" }]
          : Array.from({ length: 200 }, (_, i) => ({ id: `new${i}`, subject: "x", from: { emailAddress: { address: "a@b.example" } }, receivedDateTime: new Date(Date.parse("2026-09-01T00:00:00Z") - i * 60_000).toISOString() }));
        return ok({ value, "@odata.nextLink": older ? undefined : "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=200" });
      },
    });
    const p = new RealMailProvider(bridge, outlookAdapter, 1);
    expect((await p.getMessages())).toHaveLength(200);
    expect(p.runtime().hasMore).toBe(true);
    expect(await p.loadOlder()).toBe(1);
    expect((await p.getMessages()).at(-1)!.id).toBe("outlook:old1");
    expect(p.runtime().hasMore).toBe(false);
    expect(await p.loadOlder()).toBe(0);
    expect(page).toBe(2);
  });

  it("provider search is bounded and never merged into the cache", async () => {
    const { provider, bridge } = outlook({}, { "GET /me/messages?$search": ok({ value: [{ id: "s1", subject: "found", from: { emailAddress: { address: "z@z.example" } }, receivedDateTime: "2026-09-20T00:00:00Z" }] }) });
    await provider.getMessages();
    const found = await provider.search("found");
    expect(found.map((m) => m.id)).toEqual(["outlook:s1"]);
    expect((await provider.getMessages()).some((m) => m.id === "outlook:s1")).toBe(false);
    expect(bridge.calls.some((c) => c.path.includes("$search="))).toBe(true);
  });

  it("unsubscribe plan reflects headers; one-click goes through the native bridge", async () => {
    const { provider, bridge } = outlook({}, {
      "GET /me/mailFolders/inbox/messages": ok({ value: [{ id: "u1", subject: "News", from: { emailAddress: { address: "news@l.example" } }, receivedDateTime: "2026-09-20T00:00:00Z", internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<https://l.example/u/1>" }, { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" }] }] }),
    });
    await provider.getMessages();
    const plan = provider.unsubscribePlan("outlook:u1");
    expect(plan.capability).toBe("SUPPORTED_HEADER");
    const r = await provider.unsubscribeOneClick(plan.url!);
    expect(r.ok).toBe(true);
    expect(bridge.unsubscribed).toEqual(["https://l.example/u/1"]);
  });
});
