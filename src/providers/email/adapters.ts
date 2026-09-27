import type { Message } from "@/core/types";
import { graphNextPath, mapGmailList, mapGmailMessage, mapGmailProfile, mapGmailTotals, mapGraphFolderTotals, mapGraphMessages, mapGraphProfile, type MapContext } from "@/core/email/mappers";
import { folderName, translateGmail, translateOutlook, type RuleAction, type RuleCondition } from "@/core/email/rules";
import type { ApiFn, MailAdapter, PageResult } from "./RealMailProvider";

const PAGE = 50;

/** Microsoft Graph adapter (Outlook.com / Microsoft 365). */
export const outlookAdapter: MailAdapter = {
  id: "outlook",
  label: "Outlook",
  batchLimit: 20,
  capabilities: { ruleEnableDisable: true, providerSearch: true, nativeUnsubscribe: false, sizeEstimates: false, mailboxTotals: true },
  async fetchProfile(api: ApiFn) {
    const r = await api("GET", "/me?$select=mail,userPrincipalName,displayName");
    return mapGraphProfile(r.body);
  },
  async fetchTotals(api) {
    const r = await api("GET", "/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount");
    return mapGraphFolderTotals(r.body);
  },
  async fetchPage(api, accountId, rules, ctx, cursor) {
    const path = cursor ?? `/me/mailFolders/inbox/messages?$top=${PAGE}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,receivedDateTime,isRead,importance,hasAttachments,flag,internetMessageHeaders`;
    const r = await api("GET", path);
    const page = mapGraphMessages(r.body, accountId, rules, ctx);
    if (!page) return { messages: [], next: null };
    return { messages: page.messages, next: page.nextLink ? graphNextPath(page.nextLink) : null };
  },
  async search(api, accountId, rules, ctx, query) {
    const q = encodeURIComponent(`"${query.replace(/"/g, "")}"`);
    const r = await api("GET", `/me/messages?$search=${q}&$top=${PAGE}&$select=id,conversationId,subject,bodyPreview,body,from,receivedDateTime,isRead,importance,hasAttachments,flag,internetMessageHeaders`);
    return mapGraphMessages(r.body, accountId, rules, ctx)?.messages ?? [];
  },
  async setRead(api, rawId, read) {
    await api("PATCH", `/me/messages/${encodeURIComponent(rawId)}`, { isRead: read });
  },
  async archive(api, rawId) {
    await api("POST", `/me/messages/${encodeURIComponent(rawId)}/move`, { destinationId: "archive" });
  },
  async delete(api, rawId) {
    await api("POST", `/me/messages/${encodeURIComponent(rawId)}/move`, { destinationId: "deleteditems" });
  },
  async batch(api, rawIds, op) {
    // Graph has no bulk modify for messages; run the batch with bounded parallelism (the provider already chunks to 20).
    const results = await Promise.allSettled(rawIds.map((id) => (op === "archive" ? this.archive(api, id) : op === "trash" ? this.delete(api, id) : this.setRead(api, id, true))));
    return { succeeded: results.filter((r) => r.status === "fulfilled").length, failed: results.filter((r) => r.status === "rejected").length };
  },
  async listRules(api) {
    const r = await api("GET", "/me/mailFolders/inbox/messageRules");
    const j = JSON.parse(r.body || "{}") as { value?: { id: string; displayName?: string; isEnabled?: boolean }[] };
    return (j.value ?? []).map((x) => ({ providerRuleId: x.id, name: x.displayName ?? "Rule", enabled: x.isEnabled !== false }));
  },
  async createRule(api, condition, action, name) {
    const ids: Record<string, string> = {};
    if (action.fileTo) ids[folderName(action.fileTo)] = await ensureGraphFolder(api, folderName(action.fileTo));
    const t = translateOutlook({ condition, action, name }, ids);
    const r = await api("POST", "/me/mailFolders/inbox/messageRules", t.payload);
    const j = JSON.parse(r.body || "{}") as { id?: string };
    return { providerRuleId: j.id ?? null, capabilities: t.capabilities };
  },
  async deleteRule(api, providerRuleId) {
    await api("DELETE", `/me/mailFolders/inbox/messageRules/${encodeURIComponent(providerRuleId)}`);
  },
  async setRuleEnabled(api, providerRuleId, enabled) {
    await api("PATCH", `/me/mailFolders/inbox/messageRules/${encodeURIComponent(providerRuleId)}`, { isEnabled: enabled });
  },
  async countMatches(api, condition) {
    const filters: string[] = [];
    if (condition.from) filters.push(`from/emailAddress/address eq '${condition.from.replace(/'/g, "''")}'`);
    if (condition.subjectContains) filters.push(`contains(subject,'${condition.subjectContains.replace(/'/g, "''")}')`);
    if (condition.domain) filters.push(`endswith(from/emailAddress/address,'@${condition.domain.replace(/'/g, "''")}')`);
    if (!filters.length) return null;
    const r = await api("GET", `/me/messages/$count?$filter=${encodeURIComponent(filters.join(" and "))}`);
    const n = Number(r.body);
    return Number.isFinite(n) ? n : null;
  },
};

async function ensureGraphFolder(api: ApiFn, name: string): Promise<string> {
  const [parent, child] = name.split("/");
  const list = JSON.parse((await api("GET", `/me/mailFolders?$filter=displayName eq '${parent}'`)).body || "{}") as { value?: { id: string }[] };
  let parentId = list.value?.[0]?.id;
  if (!parentId) parentId = (JSON.parse((await api("POST", "/me/mailFolders", { displayName: parent })).body || "{}") as { id?: string }).id;
  if (!parentId) throw new Error("folder create failed");
  if (!child) return parentId;
  const kids = JSON.parse((await api("GET", `/me/mailFolders/${encodeURIComponent(parentId)}/childFolders?$filter=displayName eq '${child}'`)).body || "{}") as { value?: { id: string }[] };
  const existing = kids.value?.[0]?.id;
  if (existing) return existing;
  const created = JSON.parse((await api("POST", `/me/mailFolders/${encodeURIComponent(parentId)}/childFolders`, { displayName: child })).body || "{}") as { id?: string };
  if (!created.id) throw new Error("folder create failed");
  return created.id;
}

/** Gmail API adapter. */
export const gmailAdapter: MailAdapter = {
  id: "gmail",
  label: "Gmail",
  batchLimit: 1000,
  capabilities: { ruleEnableDisable: false, providerSearch: true, nativeUnsubscribe: false, sizeEstimates: true, mailboxTotals: true },
  async fetchProfile(api: ApiFn) {
    const r = await api("GET", "/users/me/profile");
    return mapGmailProfile(r.body);
  },
  async fetchTotals(api) {
    const r = await api("GET", "/users/me/profile");
    const t = mapGmailTotals(r.body);
    const unread = JSON.parse((await api("GET", "/users/me/labels/INBOX")).body || "{}") as { messagesUnread?: number };
    return { messages: t.messages, unread: typeof unread.messagesUnread === "number" ? unread.messagesUnread : null };
  },
  async fetchPage(api, accountId, rules, ctx, cursor) {
    const q = `/users/me/messages?labelIds=INBOX&maxResults=${PAGE}${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`;
    const list = mapGmailList((await api("GET", q)).body);
    if (!list) return { messages: [], next: null };
    const messages: Message[] = [];
    for (const id of list.ids) {
      const m = mapGmailMessage((await api("GET", `/users/me/messages/${encodeURIComponent(id)}?format=full`)).body, accountId, rules, ctx);
      if (m) messages.push(m);
    }
    return { messages, next: list.nextPageToken };
  },
  async search(api, accountId, rules, ctx, query) {
    const list = mapGmailList((await api("GET", `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${PAGE}`)).body);
    if (!list) return [];
    const out: Message[] = [];
    for (const id of list.ids) {
      const m = mapGmailMessage((await api("GET", `/users/me/messages/${encodeURIComponent(id)}?format=full`)).body, accountId, rules, ctx);
      if (m) out.push(m);
    }
    return out;
  },
  async setRead(api, rawId, read) {
    await api("POST", `/users/me/messages/${encodeURIComponent(rawId)}/modify`, read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] });
  },
  async archive(api, rawId) {
    await api("POST", `/users/me/messages/${encodeURIComponent(rawId)}/modify`, { removeLabelIds: ["INBOX"] });
  },
  async delete(api, rawId) {
    await api("POST", `/users/me/messages/${encodeURIComponent(rawId)}/trash`);
  },
  async batch(api, rawIds, op) {
    const body = op === "archive" ? { ids: rawIds, removeLabelIds: ["INBOX"] } : op === "trash" ? { ids: rawIds, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] } : { ids: rawIds, removeLabelIds: ["UNREAD"] };
    await api("POST", "/users/me/messages/batchModify", body);
    return { succeeded: rawIds.length, failed: 0 };
  },
  async listRules(api) {
    const r = await api("GET", "/users/me/settings/filters");
    const j = JSON.parse(r.body || "{}") as { filter?: { id: string; criteria?: { from?: string; query?: string } }[] };
    return (j.filter ?? []).map((f) => ({ providerRuleId: f.id, name: f.criteria?.from ?? f.criteria?.query ?? "Filter", enabled: true }));
  },
  async createRule(api, condition, action, name) {
    void name;
    const ids: Record<string, string> = {};
    if (action.fileTo) ids[folderName(action.fileTo)] = await ensureGmailLabel(api, folderName(action.fileTo));
    const t = translateGmail({ condition, action }, ids);
    const r = await api("POST", "/users/me/settings/filters", t.payload);
    const j = JSON.parse(r.body || "{}") as { id?: string };
    return { providerRuleId: j.id ?? null, capabilities: t.capabilities };
  },
  async deleteRule(api, providerRuleId) {
    await api("DELETE", `/users/me/settings/filters/${encodeURIComponent(providerRuleId)}`);
  },
  async setRuleEnabled() {
    throw new Error("Gmail filters cannot be disabled — delete and recreate instead.");
  },
  async countMatches(api, condition) {
    const parts: string[] = [];
    if (condition.from) parts.push(`from:${condition.from}`);
    else if (condition.domain) parts.push(`from:${condition.domain}`);
    if (condition.subjectContains) parts.push(`subject:(${condition.subjectContains})`);
    if (condition.listId) parts.push(`list:${condition.listId}`);
    if (!parts.length) return null;
    const r = await api("GET", `/users/me/messages?q=${encodeURIComponent(parts.join(" "))}&maxResults=1`);
    const j = JSON.parse(r.body || "{}") as { resultSizeEstimate?: number };
    return typeof j.resultSizeEstimate === "number" ? j.resultSizeEstimate : null;
  },
};

async function ensureGmailLabel(api: ApiFn, name: string): Promise<string> {
  const list = JSON.parse((await api("GET", "/users/me/labels")).body || "{}") as { labels?: { id: string; name: string }[] };
  const existing = list.labels?.find((l) => l.name === name);
  if (existing) return existing.id;
  const created = JSON.parse((await api("POST", "/users/me/labels", { name, labelListVisibility: "labelShow", messageListVisibility: "show" })).body || "{}") as { id?: string };
  if (!created.id) throw new Error("label create failed");
  return created.id;
}

export type { RuleAction, RuleCondition, PageResult, MapContext };
