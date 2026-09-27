import { convertFileSrc } from "@tauri-apps/api/core";
import type { SteamRaw } from "@/core/steam/discovery";
import type { ApiResponse } from "@/core/steam/webApi";

/**
 * Narrow native surface the RealSteamProvider depends on. Implemented by
 * TauriSteamBridge (real) and FixtureSteamBridge (tests / simulated gaming PC).
 */
export interface SteamBridge {
  discover(): Promise<SteamRaw>;
  launch(appId: number): Promise<void>;
  /** [kind, absolutePath] pairs from Steam's local artwork cache. */
  localArtwork(appId: number): Promise<Array<[string, string]>>;
  /** Convert a local file path into a WebView-loadable URL (asset protocol). */
  toAssetUrl(path: string): string;
  apiGet(endpoint: string, params: Record<string, string>): Promise<ApiResponse>;
  secretStatus(keys: string[]): Promise<Array<{ key: string; configured: boolean }>>;
  isRunningUnder(installPath: string): Promise<boolean>;
}

export class TauriSteamBridge implements SteamBridge {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  discover() {
    return this.invoke<SteamRaw>("steam_discover");
  }
  launch(appId: number) {
    return this.invoke<void>("steam_launch", { appId });
  }
  localArtwork(appId: number) {
    return this.invoke<Array<[string, string]>>("steam_local_artwork", { appId });
  }
  toAssetUrl(path: string): string {
    return convertFileSrc(path);
  }
  apiGet(endpointName: string, params: Record<string, string>) {
    return this.invoke<ApiResponse>("steam_api_get", { endpointName, params });
  }
  secretStatus(keys: string[]) {
    return this.invoke<Array<{ key: string; configured: boolean }>>("secret_status", { keys });
  }
  isRunningUnder(installDir: string) {
    return this.invoke<boolean>("process_running_under", { installDir });
  }
}

/** In-memory bridge for tests and the simulated gaming-PC environment. */
export class FixtureSteamBridge implements SteamBridge {
  launched: number[] = [];
  constructor(
    private raw: SteamRaw,
    private opts: {
      apiConfigured?: boolean;
      responses?: Record<string, ApiResponse | ((params: Record<string, string>) => ApiResponse)>;
      running?: Set<string>;
      failDiscovery?: boolean;
    } = {},
  ) {}
  async discover() {
    if (this.opts.failDiscovery) throw new Error("discovery failed");
    return this.raw;
  }
  async launch(appId: number) {
    this.launched.push(appId);
  }
  async localArtwork() {
    return [] as Array<[string, string]>;
  }
  toAssetUrl(path: string) {
    return `fixture://${path}`;
  }
  async apiGet(endpoint: string, params: Record<string, string>): Promise<ApiResponse> {
    if (!this.opts.apiConfigured) return { status: "not-configured", httpStatus: 0, body: "", cached: false };
    const r = this.opts.responses?.[endpoint];
    if (!r) return { status: "http-error", httpStatus: 500, body: "", cached: false };
    return typeof r === "function" ? r(params) : r;
  }
  async secretStatus(keys: string[]) {
    return keys.map((key) => ({ key, configured: !!this.opts.apiConfigured }));
  }
  async isRunningUnder(installPath: string) {
    return this.opts.running?.has(installPath) ?? false;
  }
}
