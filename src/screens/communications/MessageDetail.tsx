import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { EmailAccount, Message, MessageCategory } from "@/core/types";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { CATEGORY_LABEL, domainOf } from "@/core/email/classify";
import { planUnsubscribe } from "@/core/email/unsubscribe";
import { notify } from "@/state/toastStore";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/openExternal";
import { RuleComposer } from "./RuleComposer";

interface Props {
  message: Message | null;
  thread: readonly Message[];
  account: EmailAccount | null;
  onMarkUnread: (m: Message) => void;
  onArchive: (m: Message) => void;
  onDelete: (m: Message) => void;
  onRuleChanged?: () => void;
  onOneClickUnsubscribe?: (m: Message, url: string) => Promise<void>;
}

const CORRECTIONS: MessageCategory[] = ["important", "personal", "work", "financial", "purchase", "receipt", "travel", "newsletter", "subscription", "promotion", "notification", "other"];

/**
 * Reading pane. Editorial: subject as headline, sender line, quiet actions,
 * explainable classification. Bodies render as text — never as HTML — so
 * scripts, trackers and remote images from the sender can't run or load.
 */
export function MessageDetail({ message, thread, account, onMarkUnread, onArchive, onDelete, onRuleChanged, onOneClickUnsubscribe }: Props) {
  const setRule = useEmailRulesStore((s) => s.setRule);
  const [showWhy, setShowWhy] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [composeRule, setComposeRule] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!message) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <p className="text-micro tracking-cinematic text-white/25">Select a message</p>
      </div>
    );
  }
  const domain = domainOf(message.senderAddress);
  const plan = planUnsubscribe({ listUnsubscribe: message.listUnsubscribe, listUnsubscribePost: message.listUnsubscribePost, isBulk: !!(message.listUnsubscribe || message.listId) });
  const others = thread.filter((m) => m.id !== message.id);

  const moveLike = (category: MessageCategory, kind: "domain" | "address") => {
    setRule({ kind, value: kind === "domain" ? domain : message.senderAddress, category });
    setShowMove(false);
    notify.success(`Messages from ${kind === "domain" ? domain : message.sender} → ${CATEGORY_LABEL[category]}`, "Applied to this and future messages. Rules stay on this machine.");
    onRuleChanged?.();
  };
  const oneClick = async () => {
    if (!plan.url || !onOneClickUnsubscribe) return;
    setBusy(true);
    try {
      await onOneClickUnsubscribe(message, plan.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex h-full flex-col">
      <header>
        <p className="flex flex-wrap items-center gap-3 text-micro text-white/35">
          <span className="text-white/55">{CATEGORY_LABEL[message.category]}</span>
          {message.signals && message.signals.length > 0 && (
            <button onClick={() => setShowWhy((v) => !v)} className="normal-case tracking-normal text-white/35 transition-colors hover:text-white">{showWhy ? "hide why" : "why?"}</button>
          )}
          <span className="text-white/20">·</span>
          <span>{formatRelativeTime(message.timestamp)}</span>
          {account && <><span className="text-white/20">·</span><span>{account.label ?? account.displayName}</span></>}
          {others.length > 0 && <><span className="text-white/20">·</span><button onClick={() => setShowThread((v) => !v)} className="normal-case tracking-normal text-white/45 hover:text-white">{others.length + 1} in thread</button></>}
        </p>
        {showWhy && message.signals && (
          <div className="mt-3 border-l border-white/15 pl-4 text-[12.5px] leading-relaxed text-white/50">
            <p className="text-micro text-white/35">{CATEGORY_LABEL[message.category]} because</p>
            <ul className="mt-1 space-y-0.5">{message.signals.map((s) => <li key={s}>— {s}</li>)}</ul>
            <p className="mt-2 text-white/30">Deterministic, local. Correct it below and NEXUS remembers.</p>
          </div>
        )}
        <h2 className="mt-3 break-words font-display text-display-md font-semibold tracking-wide text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden" data-selectable="true">{message.subject}</h2>
        <p className="mt-3 truncate text-[14px] text-white/60"><span className="text-white/85">{message.sender.trim() || "Unknown sender"}</span> <span className="text-white/30" data-selectable="true">{message.senderAddress}</span></p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-6 text-[12.5px]">
        <Act onClick={() => onMarkUnread(message)}>Mark unread</Act>
        <Act onClick={() => onArchive(message)}>Archive</Act>
        <Act onClick={() => { setShowMove((v) => !v); setComposeRule(false); }}>Move messages like this…</Act>
        <Act onClick={() => { setComposeRule((v) => !v); setShowMove(false); }}>Create rule…</Act>
        <Act onClick={() => onDelete(message)} danger className="ml-auto">Delete</Act>
      </div>
      {showMove && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
          <span className="text-white/35">From {domain} →</span>
          {CORRECTIONS.filter((c) => c !== message.category).map((c) => (
            <button key={c} onClick={() => moveLike(c, "domain")} className="text-white/60 transition-colors hover:text-white">{CATEGORY_LABEL[c]}</button>
          ))}
          <button onClick={() => moveLike(message.category, "address")} className="text-white/35 transition-colors hover:text-white" title="Pin this exact sender to its current category">Keep sender here</button>
        </div>
      )}
      {composeRule && account && <div className="mt-4"><RuleComposer message={message} account={account} onDone={() => { setComposeRule(false); onRuleChanged?.(); }} /></div>}

      {plan.capability !== "UNAVAILABLE" && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-[12px] text-white/35">
          {plan.capability === "SUPPORTED_HEADER" && <><span>One-click unsubscribe available.</span><button disabled={busy} onClick={() => void oneClick()} className="text-white/65 hover:text-white disabled:opacity-40">{busy ? "Unsubscribing…" : "Unsubscribe"}</button></>}
          {plan.capability === "MANUAL_LINK_ONLY" && plan.url && <><span>This sender offers a web unsubscribe page.</span><button onClick={() => void openExternal(plan.url!)} className="inline-flex items-center gap-1 text-white/65 hover:text-white">Open in browser <ExternalLink size={10} /></button><span>NEXUS never navigates for you.</span></>}
          {plan.capability === "RULE_FALLBACK" && <span>No safe unsubscribe metadata — use a routing rule to mute this sender. NEXUS never sends email.</span>}
        </p>
      )}
      <div className="rule mt-4" />

      <div className="mt-8 max-w-2xl flex-1 overflow-y-auto text-[15px] leading-[1.7] text-white/70" data-selectable="true">
        {message.body.split("\n").map((line, i) => <p key={i} className="min-h-[1.2em] break-words">{line}</p>)}
        {showThread && others.length > 0 && (
          <div className="mt-10 space-y-8 border-t border-white/[0.08] pt-6">
            {others.map((m) => (
              <div key={m.id}>
                <p className="text-micro text-white/35">{m.sender} · {formatRelativeTime(m.timestamp)}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-white/60">{m.body.slice(0, 2000)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function Act({ children, onClick, danger, className }: { children: React.ReactNode; onClick: () => void; danger?: boolean; className?: string }) {
  return (
    <button onClick={onClick} className={cn("transition-colors", danger ? "text-white/35 hover:text-status-critical" : "text-white/50 hover:text-white", className)}>
      {children}
    </button>
  );
}
