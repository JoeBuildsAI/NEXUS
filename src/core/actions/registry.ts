import type { ActionContext, ActionDefinition, ActionId, ActionResult } from "./types";

/**
 * Central registry of application actions.
 *
 * SECURITY: This is the ONLY surface through which the command palette and any
 * AI/assistant provider may cause side effects. Neither the deterministic parser
 * nor a future LLM ever receives shell access — they may only select a
 * registered action id and pass structured args. Destructive actions still route
 * through their confirmation requirement.
 */
export class ActionRegistry {
  private actions = new Map<ActionId, ActionDefinition>();

  register(def: ActionDefinition): void {
    if (this.actions.has(def.id)) {
      console.warn(`[ActionRegistry] Overwriting action "${def.id}"`);
    }
    this.actions.set(def.id, def);
  }

  registerAll(defs: readonly ActionDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  get(id: ActionId): ActionDefinition | undefined {
    return this.actions.get(id);
  }

  has(id: ActionId): boolean {
    return this.actions.has(id);
  }

  list(): readonly ActionDefinition[] {
    return [...this.actions.values()];
  }

  /**
   * Execute a registered action. Returns a failure result if the action is
   * unknown. Confirmation enforcement is the caller's responsibility BEFORE
   * calling this for actions where `requiresConfirmation` is true; this method
   * asserts that gate has been satisfied via `confirmed`.
   */
  async execute(
    id: ActionId,
    ctx: ActionContext = { args: {} },
    confirmed = false,
  ): Promise<ActionResult> {
    const def = this.actions.get(id);
    if (!def) return { ok: false, message: `Unknown action: ${id}` };
    if (def.requiresConfirmation && !confirmed) {
      return {
        ok: false,
        message: `Action "${def.title}" requires confirmation.`,
      };
    }
    try {
      return await def.handler(ctx);
    } catch (err) {
      console.error(`[ActionRegistry] Action "${id}" threw`, err);
      return { ok: false, message: `Action failed: ${String(err)}` };
    }
  }
}

export const actionRegistry = new ActionRegistry();
