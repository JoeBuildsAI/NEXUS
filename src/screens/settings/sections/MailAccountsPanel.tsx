import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui";
import { getProviders } from "@/providers";
import { native } from "@/providers/system/nativeBridge";
import type { EmailAutoProvider } from "@/providers/email/EmailAutoProvider";
import type { RealMailProvider } from "@/providers/email/RealMailProvider";
import type { EmailConnectionState } from "@/core/types";
import { notify } from "@/state/toastStore";
import { config } from "@/core/config";
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
 * Outlook / Gmail account panels. NEXUS ships no client credentials: the user
 * registers an app once (Azure / Google Cloud) and pastes the client id here.
 * Everything after that — browser sign-in, PKCE, tokens — runs natively.
 */
export function MailAccountsPanel({ onChanged }: { onChanged: () => void }) {
  const email = getProviders().email as Partial<EmailAutoProvider>;
  const real = email.real ?? [];
  if (!config.isTauri || real.length === 0) {
    return (
      <div className="py-5">
        <p className="flex items-center gap-2 text-[15px] text-white/85"><Mail size={15} className="text-white/40" /> Email</p>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">Outlook and Gmail connect in the desktop build. This preview shows the demo inbox.</p>
      </div>
    );
  }
  return (
    <div className="py-5">
      <p className="flex items-center gap-2 text-[15px] text-white/85"><Mail size={15} className="text-white/40" /> Email</p>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">
        Connect with your own application registration — NEXUS never ships shared credentials. Tokens are stored in Windows Credential Manager and used only inside the native layer; message bodies are never written to disk.
      </p>
      <div className="mt-6 space-y-8">
        {real.map((p) => <AccountRow key={p.providerId} provider={p} onChanged={onChanged} />)}
      </div>
    </div>
  );
}

function AccountRow({ provider, onChanged }: { provider: RealMailProvider; onChanged: () => void }) {
  const [state, setState] = useState<EmailConnectionState>(provider.connectionState());
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const isGmail = provider.providerId === "gmail";
  const label = isGmail ? "Gmail" : "Outlook";

  const refresh = async () => setState(await provider.refreshStatus());
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
      notify.success(`${label} configured`, "Client registration stored securely.");
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
      notify.success(`${label} connected`, "Syncing your inbox.");
      activity.record("integration-connected", `${label} connected`);
    }
    else notify.warn(`${label} not connected`, r.error);
    onChanged();
  };

  const disconnect = async () => {
    setBusy(true);
    await provider.disconnect();
    setBusy(false);
    await refresh();
    notify.neutral(`${label} disconnected`, "Tokens removed from Credential Manager.");
    activity.record("integration-disconnected", `${label} disconnected`);
    onChanged();
  };

  const clearClient = async () => {
    await native.secretDelete(`email.${provider.providerId}.clientId`);
    if (isGmail) await native.secretDelete("email.gmail.clientSecret");
    await refresh();
    onChanged();
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-4">
          <p className="font-display text-[17px] tracking-wide text-white/90">{label}</p>
          <span className={cn("text-micro", state === "connected" ? "text-status-nominal/80" : state === "auth-error" ? "text-status-attention" : state === "offline" ? "text-status-warning/80" : "text-white/40")}>{STATE_LABEL[state]}</span>
        </div>
        <div className="flex items-center gap-2">
          {state === "not-configured" && <Button size="sm" variant="outline" onClick={() => setShowConfig((v) => !v)}>Configure</Button>}
          {(state === "ready-to-connect" || state === "auth-error") && <Button size="sm" variant="primary" disabled={busy} onClick={() => void connect()}>Connect</Button>}
          {(state === "connected" || state === "offline" || state === "auth-error") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>}
          {state !== "not-configured" && state !== "connecting" && <Button size="sm" variant="ghost" onClick={() => setShowConfig((v) => !v)}>Registration</Button>}
        </div>
      </div>
      <p className="mt-1 text-[12.5px] text-white/35">
        {state === "not-configured" && (isGmail ? "Create an OAuth client (Desktop app) in Google Cloud and paste its client id and secret." : "Register an app in Microsoft Entra (public client, redirect http://127.0.0.1) and paste its Application (client) id.")}
        {state === "ready-to-connect" && "Sign in through your browser. NEXUS receives a token on a local loopback address only."}
        {state === "connecting" && "Complete sign-in in the browser window. This times out after three minutes."}
        {state === "connected" && "Inbox syncs on demand, at most every 90 seconds, up to 400 recent messages."}
        {state === "auth-error" && "The stored token was rejected. Reconnect to sign in again."}
        {state === "offline" && "Mail service unreachable. Cached messages remain available."}
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
            <span className="text-[12px] text-white/30">Scopes: {isGmail ? "gmail.modify" : "Mail.ReadWrite, User.Read"} — read, mark, archive, delete. Never send.</span>
          </div>
        </div>
      )}
    </div>
  );
}
