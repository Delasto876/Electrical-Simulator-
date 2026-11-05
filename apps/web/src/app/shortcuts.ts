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
import { frameSelection } from "./focus";
import { finishRaceway, startRacewayTool, undoRacewayPoint } from "./racewayTool";
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
    keys: "Enter",
    action: "Finish the conduit / trunking run being drawn",
    run: (e) => e.key === "Enter" && finishRaceway(),
  },
  {
    keys: "Backspace (drawing)",
    action: "Remove the last point of the run being drawn",
    run: (e) => e.key === "Backspace" && undoRacewayPoint(),
  },
  {
    keys: "Delete / Backspace",
    action: "Delete the selected object",
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
      if (ui.tool.kind === "cable" && ui.tool.from) ui.setTool({ kind: "cable", from: null });
      else if (ui.tool.kind !== "select") ui.setTool({ kind: "select" });
      else ui.select(null);
      ui.setShowShortcuts(false);
      return true;
    },
  },
  {
    keys: "C",
    action: "Cable tool (click a port, then another)",
    run: (e) => {
      if (!plain(e, "c")) return false;
      const ui = useUi.getState();
      ui.setTool(ui.tool.kind === "cable" ? { kind: "select" } : { kind: "cable", from: null });
      return true;
    },
  },
  {
    keys: "U",
    action: "Conduit tool",
    run: (e) => plain(e, "u") && (toggleRaceway("conduit"), true),
  },
  {
    keys: "T",
    action: "Trunking tool",
    run: (e) => plain(e, "t") && (toggleRaceway("trunking"), true),
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
    keys: "F",
    action: "Frame the selected part (DIN devices: their enclosure)",
    run: (e) => plain(e, "f") && (frameSelection(), true),
  },
  {
    keys: "X",
    action: "Toggle x-ray (see inside enclosures)",
    run: (e) => plain(e, "x") && (useUi.getState().toggleXray(), true),
  },
  {
    keys: "B",
    action: "Toggle bonding view (green bonded / red floating)",
    run: (e) => plain(e, "b") && (useUi.getState().toggleBondingView(), true),
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

function toggleRaceway(kind: "conduit" | "trunking") {
  const t = useUi.getState().tool;
  if (t.kind === "raceway" && t.raceway === kind) useUi.getState().setTool({ kind: "select" });
  else startRacewayTool(kind);
}

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
