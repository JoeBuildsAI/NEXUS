import type { Message } from "@/core/types";
import type { UserRule } from "@/core/email/classify";
import { graphNextPath, mapGmailList, mapGmailMessage, mapGmailProfile, mapGraphMessages, mapGraphProfile } from "@/core/email/mappers";
import type { ApiFn, MailAdapter } from "./RealMailProvider";

const PAGE = 50;

/** Microsoft Graph adapter (Outlook / Microsoft 365). */
export const outlookAdapter: MailAdapter = {
  id: "outlook",
  label: "Outlook",
  async fetchProfile(api: ApiFn) {
    const r = await api("GET", "/me?$select=mail,userPrincipalName,displayName");
    return mapGraphProfile(r.body);
  },
  async fetchInbox(api: ApiFn, accountId: string, rules: readonly UserRule[], limit: number) {
    const out: Message[] = [];
    let path: string | null = `/me/mailFolders/inbox/messages?$top=${PAGE}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,receivedDateTime,isRead,importance,internetMessageHeaders`;
    while (path && out.length < limit) {
      const r = await api("GET", path);
      const page = mapGraphMessages(r.body, accountId, rules);
      if (!page) break;
      out.push(...page.messages);
      path = page.nextLink ? graphNextPath(page.nextLink) : null;
    }
    return out.slice(0, limit);
  },
  async setRead(api, rawId, read) {
    await api("PATCH", `/me/messages/${encodeURIComponent(rawId)}`, { isRead: read });
  },
  async archive(api, rawId) {
    await api("POST", `/me/messages/${encodeURIComponent(rawId)}/move`, { destinationId: "archive" });
  },
  async delete(api, rawId) {
    await api("DELETE", `/me/messages/${encodeURIComponent(rawId)}`);
  },
};

/** Gmail API adapter. */
export const gmailAdapter: MailAdapter = {
  id: "gmail",
  label: "Gmail",
  async fetchProfile(api: ApiFn) {
    const r = await api("GET", "/users/me/profile");
    return mapGmailProfile(r.body);
  },
  async fetchInbox(api: ApiFn, accountId: string, rules: readonly UserRule[], limit: number) {
    const out: Message[] = [];
    let token: string | null = null;
    // Gmail lists ids first, then each message; cap pages to keep sync bounded.
    for (let pages = 0; pages < Math.ceil(limit / PAGE) && out.length < limit; pages++) {
      const q = `/users/me/messages?labelIds=INBOX&maxResults=${PAGE}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
      const list = mapGmailList((await api("GET", q)).body);
      if (!list) break;
      for (const id of list.ids) {
        if (out.length >= limit) break;
        const m = mapGmailMessage((await api("GET", `/users/me/messages/${encodeURIComponent(id)}?format=full`)).body, accountId, rules);
        if (m) out.push(m);
      }
      token = list.nextPageToken;
      if (!token) break;
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
};
