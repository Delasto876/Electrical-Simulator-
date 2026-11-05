import { useEffect } from "react";
import {
  deleteSelection,
  duplicateArray,
  redo,
  rotatePart,
  setSetting,
  undo,
} from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

/**
 * KEYBOARD SHORTCUTS — the single list. The cheat-sheet overlay (?) renders
 * this same table, so adding a row here documents it too.
 */
export const SHORTCUTS: { keys: string; action: string; run: (e: KeyboardEvent) => boolean }[] = [
  {
    keys: "Ctrl+Z",
    action: "Undo",
    run: (e) => mod(e) && !e.shiftKey && key(e, "z") && (undo(), true),
  },
  {
    keys: "Ctrl+Shift+Z / Ctrl+Y",
    action: "Redo",
    run: (e) => mod(e) && ((e.shiftKey && key(e, "z")) || key(e, "y")) && (redo(), true),
  },
  {
    keys: "Delete / Backspace",
    action: "Delete selected array or part",
    run: (e) => (e.key === "Delete" || e.key === "Backspace") && (deleteSelection(), true),
  },
  {
    keys: "Ctrl+D",
    action: "Duplicate selected array",
    run: (e) => {
      const s = useUi.getState().selection;
      return mod(e) && key(e, "d") && s?.kind === "array" && (duplicateArray(s.id), true);
    },
  },
  {
    keys: "Esc",
    action: "Cancel placing / clear selection",
    run: (e) => {
      if (e.key !== "Escape") return false;
      const ui = useUi.getState();
      if (ui.tool.kind !== "select") ui.setTool({ kind: "select" });
      else ui.select(null);
      ui.setShowShortcuts(false);
      return true;
    },
  },
  { keys: "R", action: "Rotate selected part 90°", run: (e) => plain(e, "r") && rotateSelected() },
  {
    keys: "G",
    action: "Toggle grid snap",
    run: (e) =>
      plain(e, "g") &&
      (setSetting("gridSnap", !useProject.getState().project.settings.gridSnap), true),
  },
  {
    keys: "E",
    action: "Toggle exploded hardware view",
    run: (e) => plain(e, "e") && (useUi.getState().toggleExploded(), true),
  },
  {
    keys: "1 / 2 / 3 / 4",
    action: "3D / top / front / side view",
    run: (e) =>
      !mod(e) &&
      ["1", "2", "3", "4"].includes(e.key) &&
      (useUi.getState().setCamera((["orbit", "top", "front", "side"] as const)[Number(e.key) - 1]!),
      true),
  },
  {
    keys: "?",
    action: "Show this list",
    run: (e) =>
      e.key === "?" && (useUi.getState().setShowShortcuts(!useUi.getState().showShortcuts), true),
  },
];

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;
const key = (e: KeyboardEvent, k: string) => e.key.toLowerCase() === k;
const plain = (e: KeyboardEvent, k: string) => !mod(e) && !e.altKey && key(e, k);

function rotateSelected(): boolean {
  const s = useUi.getState().selection;
  if (s?.kind !== "part") return false;
  rotatePart(s.id);
  return true;
}

/** Install the global key handler (ignored while typing in a form field). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "SELECT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      for (const s of SHORTCUTS) {
        if (s.run(e)) {
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
