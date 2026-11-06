import { create } from "zustand";

/** Pointer position on the work surface [m, world]. Its own store: it changes every frame and only the status bar reads it. */
export const usePointer = create<{
  p: { x: number; y: number; z: number } | null;
  set: (p: { x: number; y: number; z: number } | null) => void;
}>((set) => ({ p: null, set: (p) => set({ p }) }));
