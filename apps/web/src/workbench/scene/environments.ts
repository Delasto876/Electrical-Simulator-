import type { EnvPreset } from "../state/wbView";

/**
 * ENVIRONMENT PRESETS — lighting and backdrop for the viewport. Pure data;
 * the scene turns it into lights, a procedural environment map (no HDR file,
 * so the app works offline) and a sky. The sun direction is the direction
 * TO the sun. Exposure scales the tone mapping.
 */
export interface Former {
  position: [number, number, number];
  scale: [number, number];
  intensity: number;
  color: string;
}

export interface EnvironmentDef {
  label: string;
  /** Backdrop colours for the dark and light themes; null = draw a sky. */
  background: { dark: string; light: string } | null;
  /** A vertical backdrop gradient (top, bottom) per theme, drawn instead of the flat colour. */
  gradient?: { dark: [string, string]; light: [string, string] };
  sky?: { turbidity: number; rayleigh: number };
  /** Ground colour for the dark and light themes. */
  ground: { dark: string; light: string };
  sun: { dir: [number, number, number]; color: string; intensity: number };
  hemi: { sky: string; ground: string; intensity: number };
  formers: Former[];
  /** Strength of the cast shadow on the ground (0–1). */
  shadow: number;
  exposure: number;
}

export const ENVIRONMENT_DEFS: Record<EnvPreset, EnvironmentDef> = {
  // the backdrop of a desktop CAD package: a soft grey-blue gradient, even light, crisp shadows
  cad: {
    label: "CAD studio",
    background: { dark: "#3a4350", light: "#dfe6ee" },
    gradient: { dark: ["#56616f", "#1f242b"], light: ["#ffffff", "#b9c6d4"] },
    ground: { dark: "#3b434d", light: "#d5dbe2" },
    sun: { dir: [0.45, 1, 0.65], color: "#ffffff", intensity: 2.6 },
    hemi: { sky: "#f4f8ff", ground: "#7d8794", intensity: 0.75 },
    formers: [
      { position: [0, 7, 0], scale: [12, 12], intensity: 2.0, color: "#ffffff" },
      { position: [-6, 2, 4], scale: [6, 6], intensity: 1.1, color: "#eaf2ff" },
      { position: [6, 3, -3], scale: [6, 6], intensity: 0.9, color: "#fff6ec" },
    ],
    shadow: 0.3,
    exposure: 1,
  },
  studio: {
    label: "Studio",
    background: { dark: "#2a2e35", light: "#d9dde3" },
    ground: { dark: "#343a42", light: "#c8cdd3" },
    sun: { dir: [0.5, 1, 0.7], color: "#ffffff", intensity: 2.4 },
    hemi: { sky: "#ffffff", ground: "#8a8f98", intensity: 0.5 },
    formers: [
      { position: [0, 6, 0], scale: [10, 10], intensity: 2.2, color: "#ffffff" },
      { position: [-6, 2, 3], scale: [6, 6], intensity: 1.2, color: "#e9f0ff" },
      { position: [6, 3, -3], scale: [6, 6], intensity: 1.0, color: "#fff3e6" },
    ],
    shadow: 0.35,
    exposure: 1,
  },
  daylight: {
    label: "Daylight",
    background: null,
    sky: { turbidity: 6, rayleigh: 1.6 },
    ground: { dark: "#3c4148", light: "#bfc4b8" },
    sun: { dir: [0.45, 0.85, 0.55], color: "#fff4e0", intensity: 3.2 },
    hemi: { sky: "#bcd7f5", ground: "#9a9382", intensity: 0.7 },
    formers: [
      { position: [0, 8, 0], scale: [14, 14], intensity: 2.0, color: "#cfe3ff" },
      { position: [5, 4, 5], scale: [5, 5], intensity: 2.2, color: "#fff1d6" },
      { position: [-7, 1, -2], scale: [8, 4], intensity: 0.8, color: "#aebfd1" },
    ],
    shadow: 0.5,
    exposure: 1,
  },
  overcast: {
    label: "Overcast",
    background: { dark: "#5b6068", light: "#c4c8ce" },
    ground: { dark: "#464b52", light: "#b3b8be" },
    sun: { dir: [0.2, 1, 0.3], color: "#e8edf3", intensity: 0.9 },
    hemi: { sky: "#dfe5ec", ground: "#8f949b", intensity: 1.2 },
    formers: [
      { position: [0, 8, 0], scale: [20, 20], intensity: 2.4, color: "#e6ebf1" },
      { position: [0, 1, 8], scale: [20, 4], intensity: 0.7, color: "#c8ced6" },
    ],
    shadow: 0.18,
    exposure: 1.05,
  },
  sunset: {
    label: "Sunset",
    background: null,
    sky: { turbidity: 10, rayleigh: 3 },
    ground: { dark: "#37323a", light: "#9d948f" },
    sun: { dir: [-0.85, 0.22, 0.45], color: "#ff9a4d", intensity: 3.4 },
    hemi: { sky: "#f0a878", ground: "#4f4350", intensity: 0.55 },
    formers: [
      { position: [-8, 2, 3], scale: [8, 5], intensity: 3.0, color: "#ff8f45" },
      { position: [6, 5, -4], scale: [10, 8], intensity: 1.0, color: "#7b8cc0" },
    ],
    shadow: 0.55,
    exposure: 0.95,
  },
};

/** Unit vector from a [x, y, z] direction. */
export function unit(d: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
}
