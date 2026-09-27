import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "./registry";
import type { ActionDefinition } from "./types";

function makeAction(over: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: "navigate",
    title: "Test",
    description: "",
    requiresConfirmation: false,
    keywords: [],
    handler: () => ({ ok: true }),
    ...over,
  };
}

describe("ActionRegistry", () => {
  it("executes a registered non-destructive action", async () => {
    const reg = new ActionRegistry();
    const handler = vi.fn(() => ({ ok: true, message: "done" }));
    reg.register(makeAction({ handler }));
    const res = await reg.execute("navigate");
    expect(res.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns failure for unknown actions", async () => {
    const reg = new ActionRegistry();
    const res = await reg.execute("privacy-mode");
    expect(res.ok).toBe(false);
  });

  it("SECURITY: blocks confirmation-required actions unless confirmed", async () => {
    const reg = new ActionRegistry();
    const handler = vi.fn(() => ({ ok: true }));
    reg.register(makeAction({ id: "privacy-mode", requiresConfirmation: true, handler }));

    const blocked = await reg.execute("privacy-mode");
    expect(blocked.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    const confirmed = await reg.execute("privacy-mode", { args: {} }, true);
    expect(confirmed.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("captures handler errors as failed results", async () => {
    const reg = new ActionRegistry();
    reg.register(
      makeAction({
        handler: () => {
          throw new Error("boom");
        },
      }),
    );
    const res = await reg.execute("navigate");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/boom/);
  });
});
