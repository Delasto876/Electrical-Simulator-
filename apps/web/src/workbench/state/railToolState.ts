import { create } from "zustand";
import type { CutSnap, SpliceCheck } from "@solar-sim/engine";
import type { ClampCandidate, ModuleCandidate, RailCandidate } from "../model/railTools";

/**
 * RAIL TOOLS STATE — the active Phase 3 tool (rail, cut, splice, clamp,
 * module/array, pattern), its options and what is under the cursor. Its own
 * store because hover changes every pointer move.
 */
export type RailTool =
  | {
      kind: "rail";
      catalogId: string;
      lengthM: number;
      /** Placing a piece from the offcut pool. */
      offcutId: string | null;
      rotDeg: number;
    }
  | {
      kind: "cut";
      railId: string | null;
      from: "start" | "end";
      /** Typed distance (expression) from the chosen end. */
      dist: string;
      kerfMm: number;
      keepBoth: boolean;
    }
  | {
      kind: "splice";
      catalogId: string;
      bonded: boolean;
      railA: string | null;
      railB: string | null;
      /** The last check when it failed (the bar offers Auto-align). */
      failed: SpliceCheck | null;
    }
  | { kind: "clamp"; clampKind: "mid" | "end"; mode: "add" | "join"; picked: string[] }
  | {
      kind: "module";
      catalogId: string;
      orientation: "portrait" | "landscape";
      rows: number;
      cols: number;
    }
  /** Rectangular pattern of the selection: n1 copies across (+x) every s1, n2 down the slope (+z) every s2. */
  | {
      kind: "pattern";
      ids: string[];
      n1: number;
      s1: string;
      n2: number;
      s2: string;
      /** "spacing": s is the distance between copies; "extent": s is the total length. */
      mode: "spacing" | "extent";
    }
  /** Move or copy the selection by typed or dragged distances. */
  | { kind: "move"; ids: string[]; dx: string; dz: string; copy: boolean }
  /** Mirror the selection across a line of the surface (symmetry). */
  | { kind: "mirror"; ids: string[]; axis: "x" | "z"; at: string; keep: boolean };

export interface RailToolState {
  tool: RailTool | null;
  surfaceId: string | null;
  /** Cursor on the surface [m]. */
  hover: [number, number] | null;
  /** The rail or module under the cursor (cut, splice, join). */
  hoverId: string | null;
  railCand: RailCandidate | null;
  cutSnap: CutSnap | null;
  clampCand: ClampCandidate | null;
  moduleCand: ModuleCandidate | null;
  /** Tab-to-type: rail start / module top-left corner, from the left and up-slope edges. */
  typed: { fromLeft: string; fromTop: string } | null;
  /** A drag on a Move or Pattern arrow: which axis, where it started, the value then. */
  gizmoDrag: { axis: "x" | "z"; start: number; value: number } | null;
  /** A part is being dragged on the canvas (the Move tool runs underneath; the arrows hide). */
  canvasDrag: boolean;
  set: (p: Partial<RailToolState>) => void;
}

export const useRailTool = create<RailToolState>((set) => ({
  tool: null,
  surfaceId: null,
  hover: null,
  hoverId: null,
  railCand: null,
  cutSnap: null,
  clampCand: null,
  moduleCand: null,
  typed: null,
  gizmoDrag: null,
  canvasDrag: false,
  set: (p) => set(p),
}));
