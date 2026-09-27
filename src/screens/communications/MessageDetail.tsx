import { useState } from "react";
import type { Message, MessageCategory } from "@/core/types";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { domainOf } from "@/core/email/classify";
import { unsubscribeUrl } from "@/core/email/mappers";
import { notify } from "@/state/toastStore";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  message: Message | null;
  onMarkUnread: (m: Message) => void;
  onArchive: (m: Message) => void;
  onDelete: (m: Message) => void;
  onUnsubscribe: (m: Message) => void;
  onRuleChanged?: () => void;
}

const CATEGORY_LABEL: Record<MessageCategory, string> = {
  important: "Priority", newsletter: "Newsletters", subscription: "Subscriptions", receipt: "Receipts",
  notification: "Notifications", personal: "Personal", social: "Social", other: "Other",
};
const CORRECTIONS: MessageCategory[] = ["important", "personal", "receipt", "newsletter", "notification", "other"];

async function openExternal(url: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url });
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** Reading pane. Editorial: subject as headline, sender line, quiet actions, explainable classification. */
export function MessageDetail({ message, onMarkUnread, onArchive, onDelete, onUnsubscribe, onRuleChanged }: Props) {
  const setRule = useEmailRulesStore((s) => s.setRule);
  const [showWhy, setShowWhy] = useState(false);
  const [showMove, setShowMove] = useState(false);

  if (!message) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <p className="text-micro tracking-cinematic text-white/25">Select a message</p>
      </div>
    );
  }
  const domain = domainOf(message.senderAddress);
  const unsubHttps = unsubscribeUrl(message.listUnsubscribe);

  const moveLike = (category: MessageCategory, kind: "domain" | "address") => {
    setRule({ kind, value: kind === "domain" ? domain : message.senderAddress, category });
    setShowMove(false);
    notify.success(`Messages from ${kind === "domain" ? domain : message.sender} → ${CATEGORY_LABEL[category]}`, "Applied to this and future messages. Rules stay on this machine.");
    onRuleChanged?.();
  };

  return (
    <article className="flex h-full flex-col">
      <header>
        <p className="flex items-center gap-3 text-micro text-white/35">
          <span>{CATEGORY_LABEL[message.category]}</span>
          <span className="text-white/20">·</span>
          <span>{formatRelativeTime(message.timestamp)}</span>
          {message.signals && message.signals.length > 0 && (
            <button onClick={() => setShowWhy((v) => !v)} className="normal-case tracking-normal text-white/35 transition-colors hover:text-white">{showWhy ? "hide why" : "why?"}</button>
          )}
        </p>
        {showWhy && message.signals && <p className="mt-2 text-[12.5px] text-white/45">Classified from: {message.signals.join(" · ")}.</p>}
        <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white" data-selectable="true">{message.subject}</h2>
        <p className="mt-3 text-[14px] text-white/60"><span className="text-white/85">{message.sender}</span> <span className="text-white/30" data-selectable="true">{message.senderAddress}</span></p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-6 text-[12.5px]">
        <Act onClick={() => onMarkUnread(message)}>Mark unread</Act>
        <Act onClick={() => onArchive(message)}>Archive</Act>
        <Act onClick={() => setShowMove((v) => !v)}>Move messages like this…</Act>
        {message.canUnsubscribe && <Act onClick={() => onUnsubscribe(message)}>Unsubscribe</Act>}
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
      {unsubHttps && message.canUnsubscribe && (
        <p className="mt-3 text-[12px] text-white/35">
          This sender offers a web unsubscribe. <button onClick={() => void openExternal(unsubHttps)} className="text-white/60 hover:text-white">Open in browser</button> — NEXUS never sends email on your behalf.
        </p>
      )}
      <div className="rule mt-4" />

      <div className="mt-8 max-w-2xl flex-1 overflow-y-auto text-[15px] leading-[1.7] text-white/70" data-selectable="true">
        {message.body.split("\n").map((line, i) => <p key={i} className="min-h-[1.2em]">{line}</p>)}
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
