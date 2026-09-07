import { useEffect } from "react";
import type { ToastRequest } from "../stores/ui";

const AUTO_DISMISS_MS = 5000;

export function Toast({ toast, onDismiss }: { toast: ToastRequest; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            toast.onUndo?.();
            onDismiss();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
