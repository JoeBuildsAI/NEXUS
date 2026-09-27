import { beforeEach, describe, expect, it } from "vitest";
import { RealMailProvider } from "./RealMailProvider";
import { FixtureMailBridge, ok } from "./MailBridge";
import { outlookAdapter, gmailAdapter } from "./adapters";
import { EmailAutoProvider } from "./EmailAutoProvider";
import { MockEmailProvider } from "./MockEmailProvider";
import { useEmailRulesStore } from "@/state/emailRulesStore";

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

describe("EmailAutoProvider", () => {
  it("serves the demo inbox when nothing is connected and labels it", async () => {
    const o = new RealMailProvider(new FixtureMailBridge({ provider: "outlook", clientConfigured: false, connected: false, pending: false }), outlookAdapter);
    const auto = new EmailAutoProvider([o], new MockEmailProvider(), true);
    expect(await auto.mode()).toBe("demo");
    expect((await auto.getMessages()).length).toBeGreaterThan(0);
    expect((await auto.health()).state).toBe("not-configured");
  });

  it("unifies connected accounts and routes actions by id prefix", async () => {
    const { provider, bridge } = outlook();
    const auto = new EmailAutoProvider([provider], new MockEmailProvider(), true);
    expect(await auto.mode()).toBe("real");
    const msgs = await auto.getMessages();
    expect(msgs.every((m) => m.id.startsWith("outlook:"))).toBe(true);
    await auto.markRead("outlook:m1", true);
    expect(bridge.calls.some((c) => c.method === "PATCH")).toBe(true);
  });
});
