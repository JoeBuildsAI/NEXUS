import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";
import type { UserRule } from "@/core/email/classify";
import type { MessageCategory } from "@/core/types";

const CATEGORIES: MessageCategory[] = ["important", "newsletter", "subscription", "receipt", "notification", "personal", "social", "other"];

interface EmailRulesState {
  rules: UserRule[];
  /** "Move messages like this to X" — one rule per sender/domain; later rules replace earlier. */
  setRule: (rule: UserRule) => void;
  removeRule: (kind: UserRule["kind"], value: string) => void;
  clear: () => void;
}

/** Local, private classification corrections. Never exported with secrets, never sent anywhere. */
export const useEmailRulesStore = create<EmailRulesState>()(
  persist(
    (set) => ({
      rules: [],
      setRule: (rule) => set((s) => ({ rules: [...s.rules.filter((r) => !(r.kind === rule.kind && r.value.toLowerCase() === rule.value.toLowerCase())), { ...rule, value: rule.value.toLowerCase() }].slice(-500) })),
      removeRule: (kind, value) => set((s) => ({ rules: s.rules.filter((r) => !(r.kind === kind && r.value.toLowerCase() === value.toLowerCase())) })),
      clear: () => set({ rules: [] }),
    }),
    {
      name: "nexus-email-rules",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        rules: vArr((persisted as { rules?: unknown } | undefined)?.rules, (x): x is UserRule => isObj(x) && (x.kind === "domain" || x.kind === "address") && typeof x.value === "string" && CATEGORIES.includes(x.category as MessageCategory), [], 500),
      }),
    },
  ),
);
