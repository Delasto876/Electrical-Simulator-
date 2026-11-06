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
  | { kind: "pattern"; partId: string; rows: number; cols: number; dx: string; dz: string };

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
  set: (p) => set(p),
}));
