import { create } from "zustand";

/**
 * In-app confirm / notice dialogs. The browser's confirm() and alert() are
 * blocked in sandboxed hosts (a published claude.ai page answers confirm()
 * with false at once), so the app asks through its own dialog instead.
 */
interface Pending {
  message: string;
  kind: "confirm" | "notice";
  okLabel: string;
  resolve: (ok: boolean) => void;
}

export const useDialog = create<{ pending: Pending | null }>(() => ({ pending: null }));

function open(message: string, kind: Pending["kind"], okLabel: string): Promise<boolean> {
  useDialog.getState().pending?.resolve(false);
  return new Promise((resolve) =>
    useDialog.setState({ pending: { message, kind, okLabel, resolve } }),
  );
}

/** Ask the user to confirm; resolves true on OK. */
export const askConfirm = (message: string, okLabel = "OK") => open(message, "confirm", okLabel);

/** Tell the user something (one OK button). */
export function notify(message: string): void {
  void open(message, "notice", "OK");
}

export function closeDialog(ok: boolean): void {
  const p = useDialog.getState().pending;
  useDialog.setState({ pending: null });
  p?.resolve(ok);
}
