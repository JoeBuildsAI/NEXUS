import { AnimatePresence, motion } from "framer-motion";
import { useConfirmStore } from "@/state/confirmStore";
import { Button } from "./Button";

/** Global confirmation. Typography-led; no framed card. */
export function ConfirmDialog() {
  const { request, resolve } = useConfirmStore();

  return (
    <AnimatePresence>
      {request && (
        <motion.div className="fixed inset-0 z-[200] flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => resolve(false)} />
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="relative w-full max-w-md"
            role="alertdialog"
            aria-modal
            aria-label={request.title}
          >
            <p className={`text-micro tracking-cinematic ${request.danger ? "text-status-critical/80" : "text-white/35"}`}>{request.danger ? "Confirm" : "Confirm"}</p>
            <h2 className="mt-2 font-display text-display-sm font-semibold tracking-wide text-white">{request.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/55">{request.message}</p>
            <div className="mt-8 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => resolve(false)}>{request.cancelLabel ?? "Cancel"}</Button>
              <Button variant={request.danger ? "danger" : "primary"} onClick={() => resolve(true)} autoFocus>{request.confirmLabel ?? "Confirm"}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
