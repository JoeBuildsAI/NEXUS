import { useEffect, useMemo, useState } from "react";
import type { EmailAccount, Message, MessageCategory } from "@/core/types";
import { CATEGORY_LABEL } from "@/core/email/classify";
import { previewMatches, ruleFromMessage, translate, type RuleAction, type RuleCondition } from "@/core/email/rules";
import { useRoutingRulesStore } from "@/state/routingRulesStore";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { getProviders } from "@/providers";
import type { EmailAutoProvider } from "@/providers/email/EmailAutoProvider";
import { notify } from "@/state/toastStore";
import { activity } from "@/state/activityStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Props {
  message?: Message;
  account: EmailAccount;
  initial?: { condition: RuleCondition; action: RuleAction; name: string };
  messages?: readonly Message[];
  onDone: () => void;
}

const FILE_TO: MessageCategory[] = ["subscription", "newsletter", "promotion", "notification", "receipt", "purchase", "financial", "travel", "work", "personal", "important", "other"];

/**
 * "Messages from X → Y". PREVIEW MATCHES (local + provider count) before
 * CREATE RULE. Provider capabilities are reported honestly; unsupported actions
 * are shown, never silently dropped. Nothing is created from a suggestion alone.
 */
export function RuleComposer({ message, account, initial, messages, onDone }: Props) {
  const seed = initial ?? (message ? ruleFromMessage(message, message.category === "other" ? "subscription" : message.category) : { condition: {}, action: {}, name: "Rule" });
  const [scope, setScope] = useState<"domain" | "address" | "list">(seed.condition.from ? "address" : seed.condition.listId ? "list" : "domain");
  const [fileTo, setFileTo] = useState<MessageCategory | null>(seed.action.fileTo ?? null);
  const [archive, setArchive] = useState(!!seed.action.archive);
  const [markRead, setMarkRead] = useState(!!seed.action.markRead);
  const [del, setDel] = useState(false);
  const [providerCount, setProviderCount] = useState<number | null | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const provider = account.provider === "mock" ? null : (account.provider as "gmail" | "outlook");

  const condition: RuleCondition = useMemo(() => {
    if (!message) return seed.condition;
    return scope === "address" ? { from: message.senderAddress } : scope === "list" && message.listId ? { listId: message.listId.replace(/[<>]/g, "") } : { domain: message.senderAddress.split("@")[1] ?? message.senderAddress };
  }, [message, scope, seed.condition]);
  const action: RuleAction = useMemo(() => ({ fileTo: fileTo ?? undefined, archive, markRead, delete: del }), [fileTo, archive, markRead, del]);
  const translation = useMemo(() => (provider ? translate(provider, { condition, action, name: seed.name }) : null), [provider, condition, action, seed.name]);
  const local = useMemo(() => previewMatches(messages ?? [], condition, account.id), [messages, condition, account.id]);

  useEffect(() => {
    let cancelled = false;
    setProviderCount("loading");
    const auto = getProviders().email as EmailAutoProvider;
    const p = auto.providerFor?.(account.id);
    if (!p) { setProviderCount(null); return; }
    void p.countMatches(condition).then((n) => { if (!cancelled) setProviderCount(n); });
    return () => { cancelled = true; };
  }, [account.id, condition]);

  const create = async () => {
    if (!translation?.viable) return;
    setBusy(true);
    try {
      const auto = getProviders().email as EmailAutoProvider;
      const p = auto.providerFor?.(account.id);
      let providerRuleId: string | null = null;
      if (p) {
        const r = await p.createRule(condition, action, translation.describe.slice(0, 120));
        providerRuleId = r.providerRuleId;
      }
      useRoutingRulesStore.getState().add({ accountId: account.id, provider: provider ?? "gmail", name: translation.describe.slice(0, 120), condition, action, enabled: true, providerRuleId });
      // Mirror as a local classification correction so NEXUS's own views agree with the provider rule.
      if (fileTo) useEmailRulesStore.getState().setRule({ kind: condition.from ? "address" : condition.listId ? "list" : "domain", value: condition.from ?? condition.listId ?? condition.domain ?? "", category: fileTo });
      activity.record("email-rule-created", `Routing rule created (${account.provider})`);
      notify.success("Rule created", p ? `${translation.describe} — active in ${account.provider === "gmail" ? "Gmail" : "Outlook"}.` : `${translation.describe} — recorded locally (demo account).`);
      onDone();
    } catch (e) {
      notify.error("Rule not created", String((e as Error)?.message ?? e).slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  const describe = translation?.describe ?? "Rule";
  return (
    <div className="border-l border-white/15 pl-5">
      <p className="text-micro text-white/35">New routing rule · {account.label ?? account.displayName}</p>
      <p className="mt-2 text-[15px] text-white/85">{describe}</p>

      {message && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
          <span className="text-white/35">Match</span>
          <Opt on={scope === "domain"} onClick={() => setScope("domain")}>anything from {message.senderAddress.split("@")[1]}</Opt>
          <Opt on={scope === "address"} onClick={() => setScope("address")}>exactly {message.senderAddress}</Opt>
          {message.listId && <Opt on={scope === "list"} onClick={() => setScope("list")}>this mailing list</Opt>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
        <span className="text-white/35">File to</span>
        {FILE_TO.map((c) => <Opt key={c} on={fileTo === c} onClick={() => setFileTo(fileTo === c ? null : c)}>{CATEGORY_LABEL[c]}</Opt>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
        <span className="text-white/35">Then</span>
        <Opt on={archive} onClick={() => setArchive(!archive)}>skip the inbox</Opt>
        <Opt on={markRead} onClick={() => setMarkRead(!markRead)}>mark read</Opt>
        <Opt on={del} onClick={() => setDel(!del)} danger>delete</Opt>
      </div>

      <div className="mt-5 grid gap-1 font-mono text-[11.5px] tabular text-white/45">
        <p><span className="text-white/70">{local}</span> loaded message{local === 1 ? "" : "s"} match now</p>
        <p>{providerCount === "loading" ? "counting on the server…" : providerCount == null ? "server count unavailable for this account" : <><span className="text-white/70">{providerCount.toLocaleString()}</span> match{providerCount === 1 ? "es" : ""} in the mailbox ({account.provider === "gmail" ? "estimate" : "exact"})</>}</p>
      </div>

      {translation && (
        <ul className="mt-4 space-y-0.5 text-[12px] text-white/40">
          {(Object.entries(translation.capabilities) as [keyof typeof translation.capabilities, { supported: boolean; note?: string }][])
            .filter(([k, c]) => (k === "enableDisable" || k === "domainMatch" || (action as Record<string, unknown>)[k]) && (!c.supported || c.note))
            .map(([k, c]) => <li key={k}><span className={c.supported ? "text-white/55" : "text-status-attention/80"}>{c.supported ? "note" : "unsupported"}</span> · {k}: {c.note}</li>)}
        </ul>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button size="sm" variant="primary" disabled={busy || !translation?.viable || !provider} onClick={() => void create()}>{busy ? "Creating…" : "Create rule"}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        {!provider && <span className="text-[12px] text-white/35">Demo account — connect Outlook or Gmail to create provider rules.</span>}
      </div>
    </div>
  );
}

function Opt({ on, onClick, children, danger }: { on: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("relative pb-0.5 transition-colors", on ? (danger ? "text-status-critical" : "text-white") : "text-white/45 hover:text-white/80")}>
      {children}
      {on && <span className={cn("absolute inset-x-0 -bottom-px h-px", danger ? "bg-status-critical" : "bg-white")} />}
    </button>
  );
}
