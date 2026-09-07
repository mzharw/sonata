import { useEffect } from "react";
import type { ConfirmRequest } from "../stores/ui";

export function ConfirmDialog({ request, onCancel }: { request: ConfirmRequest; onCancel: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="overlay overlay-center" onMouseDown={onCancel}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <p>{request.message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="danger"
            autoFocus
            onClick={() => {
              request.onConfirm();
              onCancel();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
