import type { AppEntry } from "@/core/types";
import type { AppProvider } from "./AppProvider";
import { createLogger } from "@/lib/logger";

const log = createLogger("apps");

/** Real Windows app discovery (resolved Start Menu shortcuts, App Paths, built-ins) via Rust. */
export class TauriAppProvider implements AppProvider {
  readonly id = "tauri-apps";
  private cache: readonly AppEntry[] | null = null;
  private inflight: Promise<readonly AppEntry[]> | null = null;
  private icons = new Map<string, Promise<string | null>>();

  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }

  async getApps(): Promise<readonly AppEntry[]> {
    if (this.cache) return this.cache;
    return this.refresh();
  }

  async refresh(): Promise<readonly AppEntry[]> {
    if (this.inflight) return this.inflight;
    this.inflight = this.invoke<AppEntry[]>("discover_apps")
      .then((apps) => {
        this.cache = apps;
        log.info("Discovered applications", { count: apps.length });
        return apps;
      })
      .catch((err) => {
        log.warn("App discovery failed", { error: String(err) });
        this.cache = [];
        return [] as readonly AppEntry[];
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  iconFor(appId: string): Promise<string | null> {
    let p = this.icons.get(appId);
    if (!p) {
      p = (async () => {
        try {
          const path = await this.invoke<string | null>("app_icon", { appId });
          if (!path) return null;
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          return convertFileSrc(path);
        } catch {
          return null;
        }
      })();
      this.icons.set(appId, p);
    }
    return p;
  }

  async launch(appId: string) {
    try {
      const name = await this.invoke<string>("launch_app", { appId });
      return { ok: true, name };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }
}
