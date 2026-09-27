import { useEffect, useState } from "react";
import type { EmailAccount, Message } from "@/core/types";
import { CATEGORY_LABEL } from "@/core/email/classify";
import { previewMatches, type RuleAction, type RuleCondition } from "@/core/email/rules";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { useRoutingRulesStore } from "@/state/routingRulesStore";
import { getProviders } from "@/providers";
import type { EmailAutoProvider } from "@/providers/email/EmailAutoProvider";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { Button } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { RuleComposer } from "./RuleComposer";

interface Props {
  messages: readonly Message[];
  accounts: readonly EmailAccount[];
  onChanged: () => void;
}

/**
 * Routing rules (provider-side) and local classification corrections, with
 * inspect / test / enable-disable (where the provider allows) / duplicate /
 * delete. Never created silently from suggestions.
 */
export function RulesPanel({ messages, accounts, onChanged }: Props) {
  const routing = useRoutingRulesStore((s) => s.rules);
  const local = useEmailRulesStore((s) => s.rules);
  const removeLocal = useEmailRulesStore((s) => s.removeRule);
  const [composing, setComposing] = useState<{ accountId: string; seed?: { condition: RuleCondition; action: RuleAction; name: string } } | null>(null);
  const [providerRules, setProviderRules] = useState<Record<string, { providerRuleId: string; name: string; enabled: boolean }[]>>({});
  const auto = getProviders().email as EmailAutoProvider;
  const realAccounts = accounts.filter((a) => a.provider === "gmail" || a.provider === "outlook");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: typeof providerRules = {};
      for (const a of realAccounts) {
        const p = auto.providerFor?.(a.id);
        if (p) out[a.id] = await p.listProviderRules();
      }
      if (!cancelled) setProviderRules(out);
    })();
    return () => { cancelled = true; };
  }, [accounts.length, routing.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountLabel = (id: string) => { const a = accounts.find((x) => x.id === id); return a?.label ?? a?.displayName ?? id; };
  const remove = (id: string) => {
    const r = routing.find((x) => x.id === id);
    if (!r) return;
    requestConfirm({
      title: "Delete this rule?",
      message: `${r.name}\n\nThe ${r.provider === "gmail" ? "Gmail filter" : "Outlook rule"} is removed from your account. Messages already filed stay where they are.`,
      confirmLabel: "Delete rule",
      danger: true,
      onConfirm: async () => {
        const p = auto.providerFor?.(r.accountId);
        if (p && r.providerRuleId) await p.deleteRule(r.providerRuleId).catch((e) => notify.warn("Provider rule not deleted", String((e as Error)?.message ?? e).slice(0, 100)));
        useRoutingRulesStore.getState().remove(id);
        notify.neutral("Rule deleted");
        onChanged();
      },
    });
  };
  const toggleEnabled = async (id: string) => {
    const r = routing.find((x) => x.id === id);
    if (!r) return;
    const p = auto.providerFor?.(r.accountId);
    if (r.provider === "gmail") return notify.warn("Gmail filters can't be disabled", "Delete it and create it again when needed.");
    try {
      if (p && r.providerRuleId) await p.setRuleEnabled(r.providerRuleId, !r.enabled);
      useRoutingRulesStore.getState().update(id, { enabled: !r.enabled });
    } catch (e) {
      notify.warn("Rule not changed", String((e as Error)?.message ?? e).slice(0, 100));
    }
  };

  if (composing) {
    const acct = accounts.find((a) => a.id === composing.accountId);
    return acct ? <RuleComposer account={acct} initial={composing.seed} messages={messages} onDone={() => { setComposing(null); onChanged(); }} /> : null;
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-micro tracking-cinematic text-white/35">Routing rules</p>
            <p className="mt-2 text-[14px] text-white/50">Live in your provider (Gmail filters, Outlook rules). NEXUS keeps the unified model and shows what each provider can and cannot do.</p>
          </div>
          <div className="flex items-center gap-3">
            {realAccounts.map((a) => <Button key={a.id} size="sm" variant="outline" onClick={() => setComposing({ accountId: a.id, seed: { condition: {}, action: {}, name: "Rule" } })}>New rule · {a.label ?? a.displayName}</Button>)}
            {realAccounts.length === 0 && <span className="text-[12.5px] text-white/35">Connect Outlook or Gmail to create provider rules.</span>}
          </div>
        </div>
        <div className="rule mt-5 mb-1" />
        {routing.length === 0 && <p className="py-6 text-[13.5px] text-white/35">No routing rules created by NEXUS yet. Start from a message (“Create rule…”) or the Subscription manager.</p>}
        <ul>
          {routing.map((r) => {
            const matches = previewMatches(messages, r.condition, r.accountId);
            const live = providerRules[r.accountId]?.find((x) => x.providerRuleId === r.providerRuleId);
            return (
              <li key={r.id} className="group flex items-baseline gap-4 py-3">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 self-center rounded-full", r.enabled ? "bg-white" : "bg-white/20")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-white/85">{r.name}</span>
                  <span className="block truncate text-micro text-white/30">{accountLabel(r.accountId)} · {r.provider} · {formatRelativeTime(r.createdAt)}{r.providerRuleId ? (live ? " · verified in provider" : providerRules[r.accountId] ? " · not found in provider" : "") : " · local only"}</span>
                </span>
                <span className="shrink-0 font-mono text-[11.5px] tabular text-white/40" title="Loaded messages matching now">{matches} match</span>
                <span className="flex shrink-0 gap-4 text-[12.5px] opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => void toggleEnabled(r.id)} className={cn("hover:text-white", r.provider === "gmail" ? "text-white/25" : "text-white/50")} title={r.provider === "gmail" ? "Gmail filters cannot be disabled" : undefined}>{r.enabled ? "Disable" : "Enable"}</button>
                  <button onClick={() => setComposing({ accountId: r.accountId, seed: { condition: r.condition, action: r.action, name: `${r.name} (copy)` } })} className="text-white/50 hover:text-white">Duplicate</button>
                  <button onClick={() => remove(r.id)} className="text-white/35 hover:text-status-critical">Delete</button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <p className="text-micro tracking-cinematic text-white/35">Local corrections</p>
        <p className="mt-2 text-[14px] text-white/50">“Move messages like this to…” decisions. They only change how NEXUS classifies; they never touch your mailbox.</p>
        <div className="rule mt-5 mb-1" />
        {local.length === 0 && <p className="py-6 text-[13.5px] text-white/35">No corrections yet.</p>}
        <ul className="grid gap-x-12 md:grid-cols-2">
          {local.map((r) => (
            <li key={`${r.kind}:${r.value}`} className="group flex items-baseline gap-3 py-2 text-[13.5px]">
              <span className="min-w-0 flex-1 truncate text-white/75">{r.kind === "list" ? "list " : ""}{r.value}</span>
              <span className="shrink-0 text-white/35">→ {CATEGORY_LABEL[r.category]}</span>
              <button onClick={() => { removeLocal(r.kind, r.value); onChanged(); }} className="shrink-0 text-[12.5px] text-white/30 opacity-0 transition-opacity hover:text-white group-hover:opacity-100">Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
