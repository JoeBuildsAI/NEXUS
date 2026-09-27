/** ActionRegistry types — the single source of truth for what NEXUS can do. */

export type ActionId =
  | "navigate"
  | "launch-game"
  | "enter-mode"
  | "exit-mode"
  | "open-storage"
  | "analyze-storage"
  | "show-processes"
  | "pause-media"
  | "mute-media"
  | "privacy-mode"
  | "toggle-command-palette";

export interface ActionContext {
  /** Free-form arguments parsed from the command (e.g. { screen: "gaming" }). */
  readonly args: Record<string, string>;
}

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
}

export interface ActionDefinition {
  readonly id: ActionId;
  readonly title: string;
  readonly description: string;
  /**
   * Destructive/impactful actions must require explicit confirmation before the
   * handler runs. The assistant/AI layer can select these but cannot bypass the
   * confirmation requirement.
   */
  readonly requiresConfirmation: boolean;
  /** Keywords/phrases used by the deterministic local command parser. */
  readonly keywords: readonly string[];
  readonly handler: (ctx: ActionContext) => ActionResult | Promise<ActionResult>;
}
