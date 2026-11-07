import { COMMANDS, disabledReason, runCommand } from "./commandRegistry";
import { cancelPlacing, rotatePlacing, toggleTyping } from "./placeActions";
import { usePlace } from "./placeState";
import { cancelRailTool, rotateTool, toggleToolTyping } from "./railToolActions";
import { useRailTool } from "./railToolState";
import { commitEdit } from "./editActions";
import { cancelWireTool, finishRaceway, undoRacewayPoint } from "./wireActions";
import { useWire } from "./wireState";
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
  if (v.construct) return (void v.set({ construct: null }), true);
  if (v.wizardOpen) return (void v.set({ wizardOpen: false }), true);
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
    if (usePlace.getState().typing) return void usePlace.setState({ typing: null });
    if (useRailTool.getState().typed) return void useRailTool.setState({ typed: null });
    if (cancelPlacing()) return;
    if (cancelRailTool()) return;
    if (cancelWireTool()) return;
    if (v.measuring) {
      usePlace.setState({ measureA: null, measureHover: null });
      return void v.set({ measuring: false });
    }
    if (v.selection) v.set({ selection: null, libraryPart: null });
    return;
  }
  if (editable(e.target)) return;
  if (usePlace.getState().placing) {
    if (e.key === "Tab") return (e.preventDefault(), toggleTyping());
    if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey)
      return (e.preventDefault(), rotatePlacing(e.shiftKey ? -15 : 15));
  }
  if (useRailTool.getState().tool && e.key === "Tab" && toggleToolTyping())
    return e.preventDefault();
  if (
    useRailTool.getState().tool &&
    e.key.toLowerCase() === "r" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey
  )
    if (rotateTool()) return e.preventDefault();
  const combo = eventToCombo(e);
  if (combo === "Enter" && acceptActiveCommand()) return e.preventDefault();
  // Raceway tool: Enter finishes the run, Backspace takes the last corner back
  if (useWire.getState().tool?.kind === "raceway") {
    if (combo === "Enter") return (e.preventDefault(), void finishRaceway());
    if (combo === "Backspace") return (e.preventDefault(), void undoRacewayPoint());
  }
  if (combo === "Ctrl+Z") return (e.preventDefault(), useWb.getState().undo());
  if (combo === "Ctrl+Shift+Z" || combo === "Ctrl+Y")
    return (e.preventDefault(), useWb.getState().redo());
  if (v.searchOpen || v.shortcutsOpen || v.aboutOpen || v.confirm) return;
  // Enter = OK of Move/Copy, Pattern and Mirror
  const tk = useRailTool.getState().tool?.kind;
  if (combo === "Enter" && (tk === "move" || tk === "pattern" || tk === "mirror"))
    return (e.preventDefault(), void commitEdit());
  // Fusion 360: F6 fits the view, Home goes to the home (isometric) view
  if (combo === "F6") return (e.preventDefault(), v.requestView("fit"));
  if (combo === "Home") return (e.preventDefault(), v.requestView("iso"));
  if ((e.ctrlKey || e.metaKey) && !["Ctrl+C", "Ctrl+V", "Ctrl+A"].includes(combo)) return;
  if (combo === "Shift+M") {
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
