import type { Message } from "@/core/types";
import { classifyMessage, type UserRule } from "./classify";

/** Strip tags and collapse whitespace for previews (never render provider HTML). */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ Microsoft Graph

export interface GraphPage {
  messages: Message[];
  nextLink: string | null;
}

/** Map a Graph `/me/messages` (or mailFolders/inbox/messages) page. */
export interface MapContext {
  /** Account slot → message id prefix "outlook:2:"; slot 1 keeps the legacy "outlook:" prefix. */
  slot?: number;
  ownDomain?: string | null;
}
export function idPrefix(provider: "outlook" | "gmail", slot = 1): string {
  return slot === 1 ? `${provider}:` : `${provider}:${slot}:`;
}

export function mapGraphMessages(body: string, accountId: string, rules: readonly UserRule[], ctx: MapContext = {}): GraphPage | null {
  const j = safeJson(body) as { value?: unknown[]; "@odata.nextLink"?: string } | null;
  if (!j || !Array.isArray(j.value)) return null;
  const messages: Message[] = [];
  for (const raw of j.value) {
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== "string") continue;
    const from = (m.from as { emailAddress?: { name?: string; address?: string } } | undefined)?.emailAddress;
    const senderAddress = String(from?.address ?? "").toLowerCase();
    const sender = String(from?.name ?? senderAddress ?? "Unknown");
    const subject = typeof m.subject === "string" ? m.subject : "(no subject)";
    const preview = typeof m.bodyPreview === "string" ? m.bodyPreview : "";
    const body = m.body as { contentType?: string; content?: string } | undefined;
    const text = body?.content ? (body.contentType?.toLowerCase() === "html" ? toPlainText(body.content) : body.content) : preview;
    const headers = Array.isArray(m.internetMessageHeaders) ? (m.internetMessageHeaders as { name?: string; value?: string }[]) : [];
    const hv = (n: string) => headers.find((h) => h.name?.toLowerCase() === n)?.value ?? null;
    const listUnsub = hv("list-unsubscribe");
    const listUnsubPost = /one-click/i.test(hv("list-unsubscribe-post") ?? "");
    const listId = hv("list-id");
    const hints: string[] = [];
    if (m.importance === "high") hints.push("importance:high");
    const flag = (m.flag as { flagStatus?: string } | undefined)?.flagStatus;
    if (flag === "flagged") hints.push("starred");
    const c = classifyMessage({ sender, senderAddress, subject, preview, listUnsubscribe: listUnsub, listId, hints, ownDomain: ctx.ownDomain ?? null, hasAttachments: m.hasAttachments === true }, rules);
    const ts = Date.parse(String(m.receivedDateTime ?? ""));
    messages.push({
      id: `${idPrefix("outlook", ctx.slot)}${m.id}`,
      rawId: m.id,
      threadId: typeof m.conversationId === "string" ? m.conversationId : null,
      hasAttachments: m.hasAttachments === true,
      starred: flag === "flagged",
      listUnsubscribePost: listUnsubPost,
      listId,
      sizeBytes: null,
      accountId,
      sender,
      senderAddress,
      subject,
      preview: preview.slice(0, 200),
      body: text.slice(0, 20_000),
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      read: m.isRead === true,
      archived: false,
      category: c.category,
      canUnsubscribe: !!listUnsub,
      signals: c.signals,
      listUnsubscribe: listUnsub,
    });
  }
  return { messages, nextLink: typeof j["@odata.nextLink"] === "string" ? j["@odata.nextLink"] : null };
}

/** Graph `/me` → account. */
export function mapGraphProfile(body: string): { address: string; displayName: string } | null {
  const j = safeJson(body) as { mail?: string; userPrincipalName?: string; displayName?: string } | null;
  if (!j) return null;
  const address = j.mail ?? j.userPrincipalName;
  if (!address) return null;
  return { address, displayName: j.displayName ?? address };
}

/** Relative path from an absolute Graph nextLink (bridge only accepts paths). */
export function graphNextPath(nextLink: string): string | null {
  const prefix = "https://graph.microsoft.com/v1.0";
  return nextLink.startsWith(prefix) ? nextLink.slice(prefix.length) : null;
}

// ------------------------------------------------------------------- Gmail

/** Gmail `users/me/messages?q=...` list → ids + nextPageToken. */
export function mapGmailList(body: string): { ids: string[]; nextPageToken: string | null } | null {
  const j = safeJson(body) as { messages?: { id?: string }[]; nextPageToken?: string } | null;
  if (!j) return null;
  return { ids: (j.messages ?? []).map((m) => m.id).filter((x): x is string => typeof x === "string"), nextPageToken: j.nextPageToken ?? null };
}

function decodeBase64Url(s: string): string {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  filename?: string;
}
function firstText(part: GmailPart | undefined, prefer: string): string | null {
  if (!part) return null;
  if (part.mimeType === prefer && part.body?.data) return decodeBase64Url(part.body.data);
  for (const p of part.parts ?? []) {
    const t = firstText(p, prefer);
    if (t) return t;
  }
  return null;
}

/** Gmail `users/me/messages/{id}?format=full` → Message. */
export function mapGmailMessage(body: string, accountId: string, rules: readonly UserRule[], ctx: MapContext = {}): Message | null {
  const j = safeJson(body) as { id?: string; threadId?: string; sizeEstimate?: number; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: GmailPart & { headers?: { name?: string; value?: string }[] } } | null;
  if (!j || typeof j.id !== "string") return null;
  const headers = j.payload?.headers ?? [];
  const h = (n: string) => headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? null;
  const fromRaw = h("From") ?? "";
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(fromRaw);
  const senderAddress = (m ? m[2]! : fromRaw).trim().toLowerCase();
  const sender = (m ? m[1]!.replace(/^"|"$/g, "") : fromRaw.split("@")[0] ?? "Unknown").trim() || senderAddress;
  const subject = h("Subject") ?? "(no subject)";
  const preview = toPlainText(j.snippet ?? "");
  const text = firstText(j.payload, "text/plain") ?? (firstText(j.payload, "text/html") ? toPlainText(firstText(j.payload, "text/html")!) : preview);
  const labels = j.labelIds ?? [];
  const hints = labels.filter((l) => l.startsWith("CATEGORY_")).map((l) => l.toLowerCase());
  if (labels.includes("IMPORTANT")) hints.push("importance:high");
  const listUnsub = h("List-Unsubscribe");
  const listUnsubPost = /one-click/i.test(h("List-Unsubscribe-Post") ?? "");
  const listId = h("List-Id");
  if (labels.includes("STARRED")) hints.push("starred");
  const hasAttachments = hasAttachmentParts(j.payload);
  const c = classifyMessage({ sender, senderAddress, subject, preview, listUnsubscribe: listUnsub, listId, hints, ownDomain: ctx.ownDomain ?? null, hasAttachments }, rules);
  return {
    id: `${idPrefix("gmail", ctx.slot)}${j.id}`,
    rawId: j.id,
    threadId: typeof j.threadId === "string" ? j.threadId : null,
    hasAttachments,
    starred: labels.includes("STARRED"),
    listUnsubscribePost: listUnsubPost,
    listId,
    sizeBytes: typeof j.sizeEstimate === "number" ? j.sizeEstimate : null,
    accountId,
    sender,
    senderAddress,
    subject,
    preview: preview.slice(0, 200),
    body: text.slice(0, 20_000),
    timestamp: Number(j.internalDate) || Date.now(),
    read: !labels.includes("UNREAD"),
    archived: !labels.includes("INBOX"),
    category: c.category,
    canUnsubscribe: !!listUnsub,
    signals: c.signals,
    listUnsubscribe: listUnsub,
  };
}

function hasAttachmentParts(part: GmailPart | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.filename.length > 0) return true;
  return (part.parts ?? []).some(hasAttachmentParts);
}

/** Gmail profile totals (KNOWN figures for Inbox Health). */
export function mapGmailTotals(body: string): { messages: number | null; unread: number | null } {
  const j = safeJson(body) as { messagesTotal?: number } | null;
  return { messages: typeof j?.messagesTotal === "number" ? j.messagesTotal : null, unread: null };
}

/** Graph inbox folder → totals. */
export function mapGraphFolderTotals(body: string): { messages: number | null; unread: number | null } {
  const j = safeJson(body) as { totalItemCount?: number; unreadItemCount?: number } | null;
  return { messages: typeof j?.totalItemCount === "number" ? j.totalItemCount : null, unread: typeof j?.unreadItemCount === "number" ? j.unreadItemCount : null };
}

/** Gmail `users/me/profile` → account. */
export function mapGmailProfile(body: string): { address: string; displayName: string } | null {
  const j = safeJson(body) as { emailAddress?: string } | null;
  if (!j?.emailAddress) return null;
  return { address: j.emailAddress, displayName: j.emailAddress };
}

/** Extract an https unsubscribe URL from a List-Unsubscribe header (never mailto). */
export function unsubscribeUrl(listUnsubscribe: string | null | undefined): string | null {
  if (!listUnsubscribe) return null;
  const m = /<(https:\/\/[^>\s]+)>/i.exec(listUnsubscribe);
  return m ? m[1]! : null;
}
