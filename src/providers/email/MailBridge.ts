export type MailProviderId = "outlook" | "gmail";

export interface OAuthStatus {
  provider: MailProviderId;
  slot?: number;
  clientConfigured: boolean;
  connected: boolean;
  pending: boolean;
}

export interface MailApiResponse {
  status: "ok" | "not-configured" | "not-connected" | "network-error" | "rate-limited" | "http-error" | "auth-error";
  httpStatus: number;
  body: string;
  retryAfterSecs: number | null;
}

export interface UnsubscribeResult {
  ok: boolean;
  httpStatus: number;
  detail: string;
}

/**
 * Narrow native surface for mail: OAuth lifecycle + an allowlisted API proxy,
 * per account slot. Tokens never cross this boundary — the bridge only carries
 * JSON bodies. One-click unsubscribe is the only outbound call not aimed at a
 * mail API, and it is validated natively (https, public host, no redirects).
 */
export interface MailBridge {
  status(provider: MailProviderId, slot: number): Promise<OAuthStatus>;
  /** Opens the browser; resolves when the loopback redirect completes (or fails). */
  connect(provider: MailProviderId, slot: number): Promise<{ ok: boolean; error?: string }>;
  disconnect(provider: MailProviderId, slot: number): Promise<void>;
  api(provider: MailProviderId, slot: number, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<MailApiResponse>;
  unsubscribeOneClick(url: string): Promise<UnsubscribeResult>;
}

export class TauriMailBridge implements MailBridge {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  status(provider: MailProviderId, slot: number) {
    return this.invoke<OAuthStatus>("oauth_status", { provider, slot });
  }
  async connect(provider: MailProviderId, slot: number): Promise<{ ok: boolean; error?: string }> {
    const { listen } = await import("@tauri-apps/api/event");
    let settle!: (r: { ok: boolean; error?: string }) => void;
    const done = new Promise<{ ok: boolean; error?: string }>((res) => (settle = res));
    const un = await listen<{ provider: string; slot?: number; ok: boolean; error?: string | null }>("oauth:complete", (e) => {
      if (e.payload.provider === provider && (e.payload.slot ?? 1) === slot) settle({ ok: e.payload.ok, error: e.payload.error ?? undefined });
    });
    const timer = setTimeout(() => settle({ ok: false, error: "Timed out waiting for the browser." }), 200_000);
    try {
      await this.invoke<void>("oauth_begin", { provider, slot });
      return await done;
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    } finally {
      clearTimeout(timer);
      un();
    }
  }
  disconnect(provider: MailProviderId, slot: number) {
    return this.invoke<void>("oauth_disconnect", { provider, slot });
  }
  api(provider: MailProviderId, slot: number, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) {
    return this.invoke<MailApiResponse>("mail_api", { provider, slot, method, path, body: body === undefined ? null : JSON.stringify(body) });
  }
  unsubscribeOneClick(url: string) {
    return this.invoke<UnsubscribeResult>("unsubscribe_one_click", { url });
  }
}

/** Scripted bridge for tests: canned responses keyed by `METHOD path-prefix`. */
export class FixtureMailBridge implements MailBridge {
  calls: { method: string; path: string; body?: unknown; slot: number }[] = [];
  unsubscribed: string[] = [];
  constructor(
    public state: OAuthStatus,
    private responses: Record<string, MailApiResponse | ((path: string, body?: unknown) => MailApiResponse)> = {},
  ) {}
  async status() {
    return this.state;
  }
  async connect() {
    this.state = { ...this.state, connected: true };
    return { ok: true };
  }
  async disconnect() {
    this.state = { ...this.state, connected: false };
  }
  async api(_p: MailProviderId, slot: number, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<MailApiResponse> {
    this.calls.push({ method, path, body, slot });
    if (!this.state.clientConfigured) return { status: "not-configured", httpStatus: 0, body: "", retryAfterSecs: null };
    if (!this.state.connected) return { status: "not-connected", httpStatus: 0, body: "", retryAfterSecs: null };
    const key = Object.keys(this.responses).find((k) => `${method} ${path}`.startsWith(k));
    const r = key ? this.responses[key]! : undefined;
    if (!r) return { status: "http-error", httpStatus: 404, body: "", retryAfterSecs: null };
    return typeof r === "function" ? r(path, body) : r;
  }
  async unsubscribeOneClick(url: string): Promise<UnsubscribeResult> {
    this.unsubscribed.push(url);
    return { ok: true, httpStatus: 200, detail: "accepted" };
  }
}

export const ok = (body: unknown): MailApiResponse => ({ status: "ok", httpStatus: 200, body: typeof body === "string" ? body : JSON.stringify(body), retryAfterSecs: null });
