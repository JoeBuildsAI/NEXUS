import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";
import type { RoutingRule } from "@/core/email/rules";

interface RoutingRulesState {
  rules: RoutingRule[];
  add: (rule: Omit<RoutingRule, "id" | "createdAt">) => RoutingRule;
  update: (id: string, patch: Partial<RoutingRule>) => void;
  remove: (id: string) => void;
  forAccount: (accountId: string) => RoutingRule[];
}

/**
 * Local record of provider routing rules NEXUS created (Gmail filters, Outlook
 * message rules). The provider is the source of truth for behavior; this store
 * keeps the unified model, provider id and the honest capability notes.
 */
export const useRoutingRulesStore = create<RoutingRulesState>()(
  persist(
    (set, get) => ({
      rules: [],
      add: (rule) => {
        const r: RoutingRule = { ...rule, id: `rr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
        set((s) => ({ rules: [...s.rules, r].slice(-300) }));
        return r;
      },
      update: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      remove: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      forAccount: (accountId) => get().rules.filter((r) => r.accountId === accountId),
    }),
    {
      name: "nexus-routing-rules",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        rules: vArr((persisted as { rules?: unknown } | undefined)?.rules, (x): x is RoutingRule => isObj(x) && typeof x.id === "string" && typeof x.accountId === "string" && (x.provider === "gmail" || x.provider === "outlook") && isObj(x.condition) && isObj(x.action), [], 300),
      }),
    },
  ),
);
