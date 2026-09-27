import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";

export type MailProviderKind = "outlook" | "gmail";

/**
 * Configured mail account slots. Tokens live natively under
 * email.<provider>.<slot>.*; this store only knows that a slot exists, its
 * label, and (once synced) the address the provider reported.
 */
export interface MailAccountSlot {
  id: string; // acct-<provider>-<slot>
  provider: MailProviderKind;
  slot: number; // 1–9
  label: string;
  address: string | null;
  addedAt: number;
}

interface EmailAccountsState {
  accounts: MailAccountSlot[];
  add: (provider: MailProviderKind, label?: string) => MailAccountSlot | null;
  remove: (id: string) => void;
  setLabel: (id: string, label: string) => void;
  setAddress: (id: string, address: string | null) => void;
}

export const accountId = (provider: MailProviderKind, slot: number) => `acct-${provider}-${slot}`;

export const useEmailAccountsStore = create<EmailAccountsState>()(
  persist(
    (set, get) => ({
      // Slot 1 of each provider always exists so a single-account setup needs no extra step.
      accounts: [
        { id: accountId("outlook", 1), provider: "outlook", slot: 1, label: "Outlook", address: null, addedAt: 0 },
        { id: accountId("gmail", 1), provider: "gmail", slot: 1, label: "Gmail", address: null, addedAt: 0 },
      ],
      add: (provider, label) => {
        const used = new Set(get().accounts.filter((a) => a.provider === provider).map((a) => a.slot));
        const slot = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((s) => !used.has(s));
        if (!slot) return null;
        const acct: MailAccountSlot = { id: accountId(provider, slot), provider, slot, label: label?.trim() || `${provider === "gmail" ? "Gmail" : "Outlook"} ${slot}`, address: null, addedAt: Date.now() };
        set((s) => ({ accounts: [...s.accounts, acct] }));
        return acct;
      },
      remove: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id || a.slot === 1) })),
      setLabel: (id, label) => set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, label: label.trim().slice(0, 40) || a.label } : a)) })),
      setAddress: (id, address) => set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, address } : a)) })),
    }),
    {
      name: "nexus-email-accounts",
      storage: safeStorage(),
      merge: (persisted, current) => {
        const list = vArr((persisted as { accounts?: unknown } | undefined)?.accounts, (x): x is MailAccountSlot => isObj(x) && (x.provider === "outlook" || x.provider === "gmail") && typeof x.slot === "number" && x.slot >= 1 && x.slot <= 9 && typeof x.label === "string", [], 18);
        const accounts = list.length ? list.map((a) => ({ ...a, id: accountId(a.provider, a.slot), address: typeof a.address === "string" ? a.address : null })) : current.accounts;
        for (const p of ["outlook", "gmail"] as const) if (!accounts.some((a) => a.provider === p && a.slot === 1)) accounts.unshift({ id: accountId(p, 1), provider: p, slot: 1, label: p === "gmail" ? "Gmail" : "Outlook", address: null, addedAt: 0 });
        return { ...current, accounts };
      },
    },
  ),
);
