import { useEffect, useState } from "react";
import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { getProviders } from "@/providers";
import { native } from "@/providers/system/nativeBridge";
import type { EmailAutoProvider } from "@/providers/email/EmailAutoProvider";
import type { RealMailProvider } from "@/providers/email/RealMailProvider";
import type { EmailConnectionState } from "@/core/types";
import { useEmailAccountsStore, type MailAccountSlot } from "@/state/emailAccountsStore";
import { notify } from "@/state/toastStore";
import { requestConfirm } from "@/state/confirmStore";
import { config } from "@/core/config";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { activity } from "@/state/activityStore";

const STATE_LABEL: Record<EmailConnectionState, string> = {
  "not-configured": "READY TO CONFIGURE",
  "ready-to-connect": "READY TO CONNECT",
  connecting: "WAITING FOR BROWSER",
  connected: "CONNECTED",
  "auth-error": "SIGN IN AGAIN",
  offline: "OFFLINE",
};

/**
 * Mail accounts. NEXUS ships no client credentials: the user registers an app
 * once per provider (Entra / Google Cloud) and pastes the client id here. Each
 * provider can hold several accounts (slots); tokens are stored per slot in
 * Windows Credential Manager and used only inside the native layer.
 */
export function MailAccountsPanel({ onChanged }: { onChanged: () => void }) {
  const email = getProviders().email as Partial<EmailAutoProvider>;
  const slots = useEmailAccountsStore((s) => s.accounts);
  const add = useEmailAccountsStore((s) => s.add);
  const real = email.real ?? [];
  if (!config.isTauri || real.length === 0) {
    return (
      <div className="py-5">
        <p className="flex items-center gap-2 text-[15px] text-white/85"><Mail size={15} className="text-white/40" /> Email</p>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">Outlook and Gmail connect in the desktop build. This preview shows the demo inbox.</p>
      </div>
    );
  }
  const byProvider = (p: "outlook" | "gmail") => slots.filter((s) => s.provider === p).sort((a, b) => a.slot - b.slot);
  return (
    <div className="py-5">
      <p className="flex items-center gap-2 text-[15px] text-white/85"><Mail size={15} className="text-white/40" /> Email</p>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">
        Connect with your own application registration — NEXUS never ships shared credentials. Tokens are stored per account in Windows Credential Manager and used only inside the native layer; message bodies are never written to disk. One registration per provider serves every account of that provider.
      </p>
      <div className="mt-6 space-y-10">
        {(["outlook", "gmail"] as const).map((p) => (
          <div key={p}>
            <div className="flex items-baseline justify-between">
              <p className="text-micro text-white/40">{p === "gmail" ? "Gmail" : "Outlook · Microsoft 365"}</p>
              <button onClick={() => { const a = add(p); if (!a) notify.warn("Account limit", "Up to nine accounts per provider."); else onChanged(); }} className="flex items-center gap-1 text-[12.5px] text-white/45 transition-colors hover:text-white"><Plus size={12} /> Add account</button>
            </div>
            <div className="mt-3 space-y-7">
              {byProvider(p).map((slot) => {
                const provider = real.find((r) => r.accountId === slot.id);
                return provider ? <AccountRow key={slot.id} slot={slot} provider={provider} onChanged={onChanged} /> : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountRow({ slot, provider, onChanged }: { slot: MailAccountSlot; provider: RealMailProvider; onChanged: () => void }) {
  const [state, setState] = useState<EmailConnectionState>(provider.connectionState());
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const { setLabel, remove, setAddress } = useEmailAccountsStore();
  const isGmail = provider.providerId === "gmail";
  const providerLabel = isGmail ? "Gmail" : "Outlook";
  const rt = provider.runtime();

  const refresh = async () => {
    setState(await provider.refreshStatus());
    const acct = provider.runtime().account;
    if (acct && acct.address !== slot.address) setAddress(slot.id, acct.address);
  };
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveClient = async () => {
    setBusy(true);
    try {
      if (clientId.trim()) {
        const r = await native.secretSet(`email.${provider.providerId}.clientId`, clientId.trim());
        if (!r.ok) throw new Error(r.error);
      }
      if (isGmail && clientSecret.trim()) {
        const r = await native.secretSet("email.gmail.clientSecret", clientSecret.trim());
        if (!r.ok) throw new Error(r.error);
      }
      setClientId("");
      setClientSecret("");
      setShowConfig(false);
      notify.success(`${providerLabel} configured`, "Client registration stored securely.");
      await refresh();
      onChanged();
    } catch (e) {
      notify.error("Could not save", String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setState("connecting");
    const r = await provider.connect();
    setBusy(false);
    await refresh();
    if (r.ok) {
      notify.success(`${slot.label} connected`, "Syncing your inbox.");
      activity.record("integration-connected", `${providerLabel} account connected`);
    } else notify.warn(`${slot.label} not connected`, r.error);
    onChanged();
  };

  const disconnect = async () => {
    setBusy(true);
    await provider.disconnect();
    setBusy(false);
    setAddress(slot.id, null);
    await refresh();
    notify.neutral(`${slot.label} disconnected`, "Tokens removed from Credential Manager.");
    activity.record("integration-disconnected", `${providerLabel} account disconnected`);
    onChanged();
  };

  const removeSlot = () => {
    requestConfirm({
      title: `Remove ${slot.label}?`,
      message: "Disconnects the account (tokens deleted) and removes this slot. Messages stay in your mailbox.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => { if (state !== "not-configured" && state !== "ready-to-connect") await provider.disconnect(); remove(slot.id); onChanged(); },
    });
  };

  const clearClient = async () => {
    await native.secretDelete(`email.${provider.providerId}.clientId`);
    if (isGmail) await native.secretDelete("email.gmail.clientSecret");
    await refresh();
    onChanged();
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <div className="flex min-w-0 items-baseline gap-4">
          {editingLabel ? (
            <input autoFocus defaultValue={slot.label} onBlur={(e) => { setLabel(slot.id, e.target.value); setEditingLabel(false); }} onKeyDown={(e) => { if (e.key === "Enter") { setLabel(slot.id, (e.target as HTMLInputElement).value); setEditingLabel(false); } }} className="h-7 w-40 border-b border-white/20 bg-transparent font-display text-[17px] tracking-wide text-white focus:outline-none" />
          ) : (
            <button onClick={() => setEditingLabel(true)} title="Rename" className="font-display text-[17px] tracking-wide text-white/90 hover:text-white">{slot.label}</button>
          )}
          {slot.address && <span className="truncate text-[12.5px] text-white/35" data-selectable="true">{slot.address}</span>}
          <span className={cn("text-micro", state === "connected" ? "text-status-nominal/80" : state === "auth-error" ? "text-status-attention" : state === "offline" ? "text-status-warning/80" : "text-white/40")}>{STATE_LABEL[state]}</span>
        </div>
        <div className="flex items-center gap-2">
          {state === "not-configured" && <Button size="sm" variant="outline" onClick={() => setShowConfig((v) => !v)}>Configure</Button>}
          {(state === "ready-to-connect" || state === "auth-error") && <Button size="sm" variant="primary" disabled={busy} onClick={() => void connect()}>Connect</Button>}
          {(state === "connected" || state === "offline" || state === "auth-error") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void provider.syncNow(true).then(() => { void refresh(); onChanged(); })}>Refresh</Button>}
          {(state === "connected" || state === "offline" || state === "auth-error") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>}
          {state !== "not-configured" && state !== "connecting" && slot.slot === 1 && <Button size="sm" variant="ghost" onClick={() => setShowConfig((v) => !v)}>Registration</Button>}
          {slot.slot !== 1 && <Button size="sm" variant="ghost" onClick={removeSlot}>Remove</Button>}
        </div>
      </div>
      <p className="mt-1 text-[12.5px] text-white/35">
        {state === "not-configured" && (isGmail ? "Create an OAuth client (Desktop app) in Google Cloud and paste its client id and secret." : "Register an app in Microsoft Entra (public client, redirect http://127.0.0.1) and paste its Application (client) id.")}
        {state === "ready-to-connect" && "Sign in through your browser. NEXUS receives a token on a local loopback address only."}
        {state === "connecting" && "Complete sign-in in the browser window. This times out after three minutes."}
        {state === "connected" && `Syncs on demand, at most every 90 seconds · ${rt.loaded.toLocaleString()} loaded${rt.hasMore ? ", more on request" : ""}${rt.sync.lastSyncAt ? ` · last sync ${formatRelativeTime(rt.sync.lastSyncAt)}` : rt.lastAttemptAt ? ` · last attempt ${formatRelativeTime(rt.lastAttemptAt)}` : ""}${rt.sync.rateLimitedUntil && rt.sync.rateLimitedUntil > Date.now() ? ` · rate limited for ${Math.ceil((rt.sync.rateLimitedUntil - Date.now()) / 1000)}s` : ""}${rt.account?.totals?.unread != null ? ` · ${rt.account.totals.unread.toLocaleString()} unread in the mailbox` : ""}`}
        {state === "auth-error" && "The stored token was rejected. Reconnect to sign in again."}
        {state === "offline" && "Mail service unreachable. Loaded messages remain available."}
      </p>
      {showConfig && (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <input autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={isGmail ? "Client id (…apps.googleusercontent.com)" : "Application (client) id"} className="h-9 border-b border-white/12 bg-transparent font-mono text-sm text-white/90 placeholder:text-white/25 focus:border-white/60 focus:outline-none" />
            {isGmail && <input type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client secret" className="h-9 border-b border-white/12 bg-transparent font-mono text-sm text-white/90 placeholder:text-white/25 focus:border-white/60 focus:outline-none" />}
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="primary" disabled={busy || !clientId.trim() || (isGmail && !clientSecret.trim() && state === "not-configured")} onClick={() => void saveClient()}>Save securely</Button>
            {state !== "not-configured" && <Button size="sm" variant="ghost" onClick={() => void clearClient()}>Remove registration</Button>}
            <span className="text-[12px] text-white/30">Scopes: {isGmail ? "gmail.modify + gmail.settings.basic" : "Mail.ReadWrite, MailboxSettings.ReadWrite, User.Read"} — read, mark, archive, delete, rules. Never send.</span>
          </div>
        </div>
      )}
    </div>
  );
}
