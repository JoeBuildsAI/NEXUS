import type { ActionId } from "@/core/actions/types";

export type MatchGroup = "navigate" | "app" | "game" | "mode" | "system" | "media" | "settings" | "mail" | "life";

export interface AssistantMatch {
  readonly actionId: ActionId;
  readonly args: Record<string, string>;
  /** 0-1 confidence. Deterministic matches are high; fuzzy matches lower. */
  readonly confidence: number;
  /** Human-readable label describing what will happen. */
  readonly label: string;
  readonly group: MatchGroup;
  readonly hint?: string;
}

/**
 * Abstraction over natural-language command interpretation.
 *
 * SECURITY: An AssistantProvider may ONLY return matches referencing registered
 * ActionRegistry ids. It never returns shell commands or free-form code. This
 * contract holds for the deterministic LocalCommandProvider today and for any
 * future LLM-backed provider.
 */
export interface AssistantProvider {
  readonly id: string;
  /** Return best matches for a natural-ish command, ranked by confidence. */
  interpret(input: string): Promise<readonly AssistantMatch[]>;
}
