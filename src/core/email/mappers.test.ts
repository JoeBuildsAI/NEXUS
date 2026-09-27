import { describe, expect, it } from "vitest";
import { graphNextPath, mapGmailList, mapGmailMessage, mapGraphMessages, mapGraphProfile, toPlainText, unsubscribeUrl } from "./mappers";

const GRAPH_PAGE = JSON.stringify({
  "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=50",
  value: [
    {
      id: "AAMk1",
      subject: "Your invoice for September",
      bodyPreview: "Invoice #4471 total $12.00",
      body: { contentType: "html", content: "<p>Invoice <b>#4471</b><script>alert(1)</script></p>" },
      from: { emailAddress: { name: "Acme Billing", address: "billing@acme.example" } },
      receivedDateTime: "2026-09-26T10:00:00Z",
      isRead: false,
      importance: "normal",
      internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<https://acme.example/unsub?u=1>, <mailto:unsub@acme.example>" }],
    },
    { id: "AAMk2", subject: "Lunch?", from: { emailAddress: { name: "Sarah Kim", address: "sarah.kim@friends.example" } }, receivedDateTime: "2026-09-26T11:00:00Z", isRead: true },
    { notAnId: true },
  ],
});

const GMAIL_MSG = JSON.stringify({
  id: "18f3",
  snippet: "Co-op tonight? &amp; bring snacks",
  internalDate: "1758880800000",
  labelIds: ["UNREAD", "INBOX", "CATEGORY_PERSONAL"],
  payload: {
    mimeType: "multipart/alternative",
    headers: [{ name: "From", value: "\"Alex Chen\" <alex.chen@gmail.com>" }, { name: "Subject", value: "Co-op tonight?" }],
    parts: [{ mimeType: "text/plain", body: { data: btoa("We Were Here Too at 9?").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") } }],
  },
});

describe("Graph mapping", () => {
  it("maps messages, strips HTML, classifies, and exposes pagination", () => {
    const page = mapGraphMessages(GRAPH_PAGE, "acct-outlook", [])!;
    expect(page.messages).toHaveLength(2);
    const inv = page.messages[0]!;
    expect(inv.id).toBe("outlook:AAMk1");
    expect(inv.category).toBe("receipt");
    expect(inv.body).not.toContain("<");
    expect(inv.body).not.toContain("alert(1)");
    expect(inv.read).toBe(false);
    expect(inv.canUnsubscribe).toBe(true);
    expect(unsubscribeUrl(inv.listUnsubscribe)).toBe("https://acme.example/unsub?u=1");
    expect(page.messages[1]!.category).toBe("personal");
    expect(graphNextPath(page.nextLink!)).toBe("/me/mailFolders/inbox/messages?$skip=50");
    expect(graphNextPath("https://evil.example/x")).toBeNull();
  });

  it("maps profile and tolerates garbage", () => {
    expect(mapGraphProfile(JSON.stringify({ mail: "j@outlook.com", displayName: "Joseph" }))).toEqual({ address: "j@outlook.com", displayName: "Joseph" });
    expect(mapGraphProfile("nope")).toBeNull();
    expect(mapGraphMessages("{}", "a", [])).toBeNull();
  });
});

describe("Gmail mapping", () => {
  it("maps a full message with decoded body and label-derived state", () => {
    const m = mapGmailMessage(GMAIL_MSG, "acct-gmail", [])!;
    expect(m.id).toBe("gmail:18f3");
    expect(m.sender).toBe("Alex Chen");
    expect(m.senderAddress).toBe("alex.chen@gmail.com");
    expect(m.body).toBe("We Were Here Too at 9?");
    expect(m.preview).toBe("Co-op tonight? & bring snacks");
    expect(m.read).toBe(false);
    expect(m.archived).toBe(false);
    expect(m.category).toBe("personal");
    expect(m.timestamp).toBe(1758880800000);
  });

  it("maps list pages", () => {
    expect(mapGmailList(JSON.stringify({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "tok" }))).toEqual({ ids: ["a", "b"], nextPageToken: "tok" });
    expect(mapGmailList(JSON.stringify({}))).toEqual({ ids: [], nextPageToken: null });
  });

  it("never returns mailto unsubscribe targets", () => {
    expect(unsubscribeUrl("<mailto:x@y>")).toBeNull();
    expect(unsubscribeUrl("<http://insecure.example/u>")).toBeNull();
  });

  it("plain-text conversion is safe", () => {
    expect(toPlainText("<div>a<br>b</div><style>x{}</style>&lt;tag&gt;")).toBe("a\nb\n <tag>");
  });
});
