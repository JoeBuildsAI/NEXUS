import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmState {
  request: ConfirmRequest | null;
  confirm: (req: ConfirmRequest) => void;
  resolve: (confirmed: boolean) => void;
}

/** Global confirmation gate used for destructive/impactful actions. */
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  confirm: (request) => set({ request }),
  resolve: (confirmed) => {
    const req = get().request;
    if (confirmed && req) req.onConfirm();
    set({ request: null });
  },
}));

/** Imperative helper for non-component call sites. */
export function requestConfirm(req: ConfirmRequest): void {
  useConfirmStore.getState().confirm(req);
}
