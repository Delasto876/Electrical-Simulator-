import { useEffect, useRef } from "react";
import { closeDialog, useDialog } from "./dialogs";

/** Renders the pending confirm / notice dialog (see dialogs.ts). */
export function DialogHost() {
  const pending = useDialog((s) => s.pending);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), [pending]);
  if (!pending) return null;
  return (
    <div
      className="overlay"
      role={pending.kind === "confirm" ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-label={pending.kind === "confirm" ? "Confirm" : "Notice"}
      onKeyDown={(e) => e.key === "Escape" && closeDialog(false)}
      onClick={() => closeDialog(false)}
    >
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <p>{pending.message}</p>
        <div className="dialog-actions">
          {pending.kind === "confirm" && (
            <button type="button" data-testid="dialog-cancel" onClick={() => closeDialog(false)}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="primary"
            ref={ok}
            data-testid="dialog-ok"
            onClick={() => closeDialog(true)}
          >
            {pending.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
