import type { AppEntry } from "@/core/types";

/**
 * Application discovery + launching.
 *
 * SECURITY: Only applications discovered by the provider (or explicitly added by
 * the user) can be launched, and only by opaque id. The command palette / AI
 * never passes a path or executable name to the native layer.
 */
export interface AppProvider {
  readonly id: string;
  /** Cached list; call refresh() to re-discover. */
  getApps(): Promise<readonly AppEntry[]>;
  refresh(): Promise<readonly AppEntry[]>;
  launch(appId: string): Promise<{ ok: boolean; name?: string; message?: string }>;
}
