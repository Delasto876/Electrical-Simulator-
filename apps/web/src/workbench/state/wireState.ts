import { create } from "zustand";

/**
 * WIRE TOOL STATE — the Wire tool (pick a terminal, then another) and the
 * Raceway tool (click the corners of a trunking or conduit run on a surface).
 * Its own store: the hover changes with every pointer move.
 */
export type WireTool =
  | {
      kind: "wire";
      cableId: string;
      /** Pull the next wire through this run (null = direct). */
      racewayId: string | null;
      /** First terminal picked. */
      from: string | null;
    }
  | {
      kind: "raceway";
      catalogId: string;
      surfaceId: string | null;
      /** Corners so far (surface frame) [m]. */
      points: [number, number][];
    };

export interface WireState {
  tool: WireTool | null;
  /** Terminal under the pointer (wire tool). */
  hoverTerm: string | null;
  /** Pointer on the surface (raceway tool) [m]. */
  hoverPoint: [number, number] | null;
  set: (p: Partial<WireState>) => void;
}

export const useWire = create<WireState>((set) => ({
  tool: null,
  hoverTerm: null,
  hoverPoint: null,
  set: (p) => set(p),
}));
