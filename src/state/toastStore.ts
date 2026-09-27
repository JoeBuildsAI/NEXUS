import { create } from "zustand";

export type ToastTone = "neutral" | "accent" | "success" | "warning" | "critical";

export interface Toast {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly tone: ToastTone;
  /** Auto-dismiss after ms; 0 = sticky. */
  readonly durationMs: number;
  readonly createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "createdAt" | "durationMs" | "tone"> & Partial<Pick<Toast, "durationMs" | "tone">>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `toast-${Date.now()}-${seq++}`;
    const toast: Toast = {
      id,
      title: t.title,
      description: t.description,
      tone: t.tone ?? "neutral",
      durationMs: t.durationMs ?? 3800,
      createdAt: Date.now(),
    };
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }));
    if (toast.durationMs > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, toast.durationMs);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative helper for non-component call sites (stores, actions). */
export const notify = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: "accent" }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: "success" }),
  warn: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: "warning" }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: "critical", durationMs: 6000 }),
  neutral: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: "neutral" }),
};
