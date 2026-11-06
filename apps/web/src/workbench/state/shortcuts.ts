import { COMMANDS, disabledReason, runCommand } from "./commandRegistry";
import { useWb } from "./wbStore";
import { useView } from "./wbView";

/**
 * KEYBOARD — turns a key event into a combo string ("F", "Shift+F", "Ctrl+Z",
 * "?") and runs the command that owns it. Typing in a field never triggers a
 * shortcut. Escape closes the top-most overlay, then cancels the active
 * command, then clears the selection.
 */
export function eventToCombo(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  const printable = e.key.length === 1;
  const key = printable ? e.key.toUpperCase() : e.key;
  // Shift is part of the combo for letters and named keys, but not for symbols it produces ("?")
  const isLetterOrDigit = /^[A-Z0-9]$/.test(key);
  if (e.shiftKey && (!printable || isLetterOrDigit)) parts.push("Shift");
  parts.push(key === " " ? "Space" : key);
  return parts.join("+");
}

const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};

/** Close the top-most overlay. Returns true if something was closed. */
export function closeTopOverlay(): boolean {
  const v = useView.getState();
  if (v.confirm) return (void v.set({ confirm: null }), true);
  if (v.marking) return (void v.set({ marking: null }), true);
  if (v.searchOpen) return (void v.set({ searchOpen: false }), true);
  if (v.shortcutsOpen) return (void v.set({ shortcutsOpen: false }), true);
  if (v.aboutOpen) return (void v.set({ aboutOpen: false }), true);
  return false;
}

/** Cancel the command whose options bar is open (restores what it changed). */
export function cancelActiveCommand(): boolean {
  const v = useView.getState();
  if (!v.activeCommand) return false;
  if (v.activeCommand.backup) v.set({ section: v.activeCommand.backup });
  v.set({ activeCommand: null });
  return true;
}

export function acceptActiveCommand(): boolean {
  const v = useView.getState();
  if (!v.activeCommand) return false;
  v.set({ activeCommand: null });
  return true;
}

export function handleKeyDown(e: KeyboardEvent): void {
  const v = useView.getState();
  if (e.key === "Escape") {
    if (editable(e.target)) (e.target as HTMLElement).blur();
    if (closeTopOverlay() || cancelActiveCommand()) return;
    if (v.selection) v.set({ selection: null, libraryPart: null });
    return;
  }
  if (editable(e.target)) return;
  const combo = eventToCombo(e);
  if (combo === "Enter" && acceptActiveCommand()) return e.preventDefault();
  if (combo === "Ctrl+Z") return (e.preventDefault(), useWb.getState().undo());
  if (combo === "Ctrl+Shift+Z" || combo === "Ctrl+Y")
    return (e.preventDefault(), useWb.getState().redo());
  if (e.ctrlKey || e.metaKey) return;
  if (v.searchOpen || v.shortcutsOpen || v.aboutOpen || v.confirm) return;
  if (combo === "M") {
    // keyboard way to the marking menu (right-click needs a mouse)
    v.set({
      marking: { x: window.innerWidth / 2, y: window.innerHeight / 2, targetId: v.selection },
    });
    return e.preventDefault();
  }
  const cmd = Object.values(COMMANDS).find((c) => c.shortcut === combo);
  if (cmd) {
    e.preventDefault();
    if (disabledReason(cmd)) return void runCommand(cmd.id);
    runCommand(cmd.id);
  }
}
