export type MailProviderId = "outlook" | "gmail";

export interface OAuthStatus {
  provider: MailProviderId;
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

/**
 * Narrow native surface for mail: OAuth lifecycle + an allowlisted API proxy.
 * Tokens never cross this boundary — the bridge only carries JSON bodies.
 */
export interface MailBridge {
  status(provider: MailProviderId): Promise<OAuthStatus>;
  /** Opens the browser; resolves when the loopback redirect completes (or fails). */
  connect(provider: MailProviderId): Promise<{ ok: boolean; error?: string }>;
  disconnect(provider: MailProviderId): Promise<void>;
  api(provider: MailProviderId, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<MailApiResponse>;
}

export class TauriMailBridge implements MailBridge {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  status(provider: MailProviderId) {
    return this.invoke<OAuthStatus>("oauth_status", { provider });
  }
  async connect(provider: MailProviderId): Promise<{ ok: boolean; error?: string }> {
    const { listen } = await import("@tauri-apps/api/event");
    let settle!: (r: { ok: boolean; error?: string }) => void;
    const done = new Promise<{ ok: boolean; error?: string }>((res) => (settle = res));
    const un = await listen<{ provider: string; ok: boolean; error?: string | null }>("oauth:complete", (e) => {
      if (e.payload.provider === provider) settle({ ok: e.payload.ok, error: e.payload.error ?? undefined });
    });
    const timer = setTimeout(() => settle({ ok: false, error: "Timed out waiting for the browser." }), 200_000);
    try {
      await this.invoke<void>("oauth_begin", { provider });
      return await done;
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    } finally {
      clearTimeout(timer);
      un();
    }
  }
  disconnect(provider: MailProviderId) {
    return this.invoke<void>("oauth_disconnect", { provider });
  }
  api(provider: MailProviderId, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) {
    return this.invoke<MailApiResponse>("mail_api", { provider, method, path, body: body === undefined ? null : JSON.stringify(body) });
  }
}

/** Scripted bridge for tests: canned responses keyed by `METHOD path-prefix`. */
export class FixtureMailBridge implements MailBridge {
  calls: { method: string; path: string; body?: unknown }[] = [];
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
  async api(_p: MailProviderId, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<MailApiResponse> {
    this.calls.push({ method, path, body });
    if (!this.state.clientConfigured) return { status: "not-configured", httpStatus: 0, body: "", retryAfterSecs: null };
    if (!this.state.connected) return { status: "not-connected", httpStatus: 0, body: "", retryAfterSecs: null };
    const key = Object.keys(this.responses).find((k) => `${method} ${path}`.startsWith(k));
    const r = key ? this.responses[key]! : undefined;
    if (!r) return { status: "http-error", httpStatus: 404, body: "", retryAfterSecs: null };
    return typeof r === "function" ? r(path, body) : r;
  }
}

export const ok = (body: unknown): MailApiResponse => ({ status: "ok", httpStatus: 200, body: typeof body === "string" ? body : JSON.stringify(body), retryAfterSecs: null });
