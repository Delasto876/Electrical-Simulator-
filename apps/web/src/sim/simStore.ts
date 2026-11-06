import { create } from "zustand";
import type { SimOutput } from "@solar-sim/engine";

/**
 * Simulation results and the time slider. Results are derived data: never
 * saved in the project, and marked out of date when the project changes.
 */
export interface SimState {
  status: "idle" | "weather" | "running" | "done" | "error";
  message: string | null;
  output: SimOutput | null;
  weatherLabel: string | null;
  /** Project revision the results belong to (to flag them as out of date). */
  revision: number | null;
  /** Time-slider position (step index) and playback. */
  index: number;
  playing: boolean;
  setIndex: (i: number) => void;
  setPlaying: (p: boolean) => void;
}

export const useSim = create<SimState>((set) => ({
  status: "idle",
  message: null,
  output: null,
  weatherLabel: null,
  revision: null,
  index: 0,
  playing: false,
  setIndex: (index) => set({ index }),
  setPlaying: (playing) => set({ playing }),
}));

/** Value of a channel at the slider position (undefined without results). */
export function atIndex(
  out: SimOutput | null,
  channel: keyof SimOutput["channels"],
  i: number,
): number | undefined {
  const a = out?.channels[channel];
  return a && i < a.length ? a[i] : undefined;
}
