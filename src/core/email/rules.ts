import type { Message, MessageCategory } from "@/core/types";

/**
 * Unified routing-rule model, translated to provider-specific rules with an
 * honest capability report. Gmail filters and Outlook message rules are not
 * equivalent — unsupported actions are reported, never silently dropped.
 */
export type MailProviderKind = "gmail" | "outlook";

export interface RuleCondition {
  /** Exact sender address. */
  from?: string;
  /** Sender domain (and subdomains for Gmail; "contains" for Outlook). */
  domain?: string;
  subjectContains?: string;
  /** List-Id header value (Gmail supports via query; Outlook via header contains). */
  listId?: string;
}

export interface RuleAction {
  /** NEXUS category the rule files into (mapped to a label/folder named "NEXUS/<Category>"). */
  fileTo?: MessageCategory;
  markRead?: boolean;
  /** Skip the inbox (Gmail: remove INBOX; Outlook: move out of Inbox). */
  archive?: boolean;
  /** Move to trash / Deleted Items. */
  delete?: boolean;
  star?: boolean;
}

export interface RoutingRule {
  id: string;
  accountId: string;
  provider: MailProviderKind;
  name: string;
  condition: RuleCondition;
  action: RuleAction;
  enabled: boolean;
  /** Provider-side id once created. */
  providerRuleId: string | null;
  createdAt: number;
}

export interface Capability {
  supported: boolean;
  note?: string;
}

export interface Translation {
  /** Provider payload (Gmail filter resource / Graph messageRule). */
  payload: Record<string, unknown>;
  /** Per-action support report. */
  capabilities: Record<keyof RuleAction | "enableDisable" | "domainMatch", Capability>;
  /** Human-readable description NEXUS shows before creating. */
  describe: string;
  /** Whether at least one action is supported. */
  viable: boolean;
}

export const NEXUS_FOLDER_PREFIX = "NEXUS";
export function folderName(category: MessageCategory): string {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return `${NEXUS_FOLDER_PREFIX}/${label}`;
}

function describeRule(r: { condition: RuleCondition; action: RuleAction }): string {
  const who = r.condition.from ? `messages from ${r.condition.from}` : r.condition.domain ? `anything from ${r.condition.domain}` : r.condition.listId ? "this mailing list" : r.condition.subjectContains ? `subjects containing “${r.condition.subjectContains}”` : "matching messages";
  const acts: string[] = [];
  if (r.action.fileTo) acts.push(`→ ${folderName(r.action.fileTo)}`);
  if (r.action.archive) acts.push("skip the inbox");
  if (r.action.markRead) acts.push("mark read");
  if (r.action.star) acts.push("star");
  if (r.action.delete) acts.push("delete");
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} ${acts.join(", ") || "(no action)"}`;
}

/** Gmail: users.settings.filters resource. Labels are referenced by id; NEXUS resolves names → ids before create. */
export function translateGmail(rule: { condition: RuleCondition; action: RuleAction }, labelIds: Record<string, string> = {}): Translation {
  const c = rule.condition;
  const a = rule.action;
  const criteria: Record<string, string> = {};
  const q: string[] = [];
  if (c.from) criteria.from = c.from;
  if (c.domain) q.push(`from:${c.domain}`); // Gmail treats from:domain as a domain match incl. subdomains
  if (c.listId) q.push(`list:${c.listId}`);
  if (c.subjectContains) criteria.subject = c.subjectContains;
  if (q.length) criteria.query = q.join(" ");
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];
  const capabilities: Translation["capabilities"] = {
    fileTo: { supported: true },
    markRead: { supported: true },
    archive: { supported: true },
    delete: { supported: true, note: "Gmail files it under Trash (recoverable for 30 days)." },
    star: { supported: true },
    enableDisable: { supported: false, note: "Gmail filters cannot be disabled — only deleted and recreated." },
    domainMatch: { supported: true },
  };
  if (a.fileTo) {
    const id = labelIds[folderName(a.fileTo)];
    if (id) addLabelIds.push(id);
    else capabilities.fileTo = { supported: true, note: `Label ${folderName(a.fileTo)} will be created first.` };
  }
  if (a.markRead) removeLabelIds.push("UNREAD");
  if (a.archive) removeLabelIds.push("INBOX");
  if (a.delete) addLabelIds.push("TRASH");
  if (a.star) addLabelIds.push("STARRED");
  const action: Record<string, unknown> = {};
  if (addLabelIds.length) action.addLabelIds = addLabelIds;
  if (removeLabelIds.length) action.removeLabelIds = removeLabelIds;
  return { payload: { criteria, action }, capabilities, describe: describeRule(rule), viable: Object.keys(action).length > 0 || !!a.fileTo };
}

/** Outlook: Graph messageRule. Folders referenced by id; NEXUS resolves names → ids before create. */
export function translateOutlook(rule: { condition: RuleCondition; action: RuleAction; name?: string }, folderIds: Record<string, string> = {}): Translation {
  const c = rule.condition;
  const a = rule.action;
  const conditions: Record<string, unknown> = {};
  if (c.from) conditions.fromAddresses = [{ emailAddress: { address: c.from } }];
  if (c.domain) conditions.senderContains = [`@${c.domain}`];
  if (c.subjectContains) conditions.subjectContains = [c.subjectContains];
  if (c.listId) conditions.headerContains = [`List-Id: ${c.listId}`];
  const actions: Record<string, unknown> = {};
  const capabilities: Translation["capabilities"] = {
    fileTo: { supported: true },
    markRead: { supported: true },
    archive: { supported: true, note: "Moves to the Archive folder." },
    delete: { supported: true, note: "Moves to Deleted Items (recoverable)." },
    star: { supported: false, note: "Outlook rules flag messages instead of starring; NEXUS flags for follow-up." },
    enableDisable: { supported: true },
    domainMatch: { supported: true, note: "Matched as sender contains “@domain” (subdomains included)." },
  };
  if (a.fileTo) {
    const id = folderIds[folderName(a.fileTo)];
    if (id) actions.moveToFolder = id;
    else capabilities.fileTo = { supported: true, note: `Folder ${folderName(a.fileTo)} will be created first.` };
  }
  if (a.markRead) actions.markAsRead = true;
  if (a.archive && !a.fileTo) actions.moveToFolder = folderIds.archive ?? "archive";
  if (a.delete) actions.delete = true;
  if (a.star) actions.markImportance = "high";
  const payload: Record<string, unknown> = { displayName: rule.name ?? describeRule(rule).slice(0, 120), sequence: 1, isEnabled: true, conditions, actions };
  return { payload, capabilities, describe: describeRule(rule), viable: Object.keys(actions).length > 0 || !!a.fileTo };
}

export function translate(provider: MailProviderKind, rule: { condition: RuleCondition; action: RuleAction; name?: string }, ids: Record<string, string> = {}): Translation {
  return provider === "gmail" ? translateGmail(rule, ids) : translateOutlook(rule, ids);
}

/** Local preview: which loaded messages would this rule match right now? */
export function matchesRule(m: Message, c: RuleCondition): boolean {
  const addr = m.senderAddress.toLowerCase();
  if (c.from && addr !== c.from.toLowerCase()) return false;
  if (c.domain) {
    const d = addr.split("@")[1] ?? "";
    const want = c.domain.toLowerCase();
    if (!(d === want || d.endsWith(`.${want}`))) return false;
  }
  if (c.subjectContains && !m.subject.toLowerCase().includes(c.subjectContains.toLowerCase())) return false;
  if (c.listId && !(m.listId ?? "").toLowerCase().includes(c.listId.toLowerCase())) return false;
  return !!(c.from || c.domain || c.subjectContains || c.listId);
}

export function previewMatches(messages: readonly Message[], c: RuleCondition, accountId?: string): number {
  return messages.filter((m) => (!accountId || m.accountId === accountId) && matchesRule(m, c)).length;
}

/** Suggest a rule from a message ("Move future messages like this → X"). */
export function ruleFromMessage(m: Message, category: MessageCategory, scope: "domain" | "address" | "list" = "domain"): { condition: RuleCondition; action: RuleAction; name: string } {
  const condition: RuleCondition = scope === "address" ? { from: m.senderAddress } : scope === "list" && m.listId ? { listId: m.listId.replace(/[<>]/g, "") } : { domain: m.senderAddress.split("@")[1] ?? m.senderAddress };
  const archive = ["newsletter", "subscription", "promotion", "notification", "social"].includes(category);
  return { condition, action: { fileTo: category, archive, markRead: false }, name: `${m.sender} → ${category}` };
}
