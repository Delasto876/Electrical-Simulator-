/**
 * The insulation colours offered by the Wire tool. The user picks the colour
 * of every wire (no colour code is applied); any other colour can be typed in
 * the colour picker.
 */
export const WIRE_PALETTE: { name: string; hex: string }[] = [
  { name: "Red", hex: "#d33a2c" },
  { name: "Black", hex: "#1f2124" },
  { name: "White", hex: "#ececec" },
  { name: "Green", hex: "#2f9e44" },
  { name: "Green/yellow", hex: "#9fc92a" },
  { name: "Blue", hex: "#2f62c8" },
  { name: "Brown", hex: "#7a4a24" },
  { name: "Grey", hex: "#8c939b" },
  { name: "Orange", hex: "#ee7d1d" },
  { name: "Yellow", hex: "#f2c230" },
  { name: "Purple", hex: "#7f4fc9" },
  { name: "Pink", hex: "#e877a8" },
  { name: "Bare copper", hex: "#c47a3c" },
];
export const DEFAULT_WIRE_COLOR = "#d33a2c";
export const colorName = (hex: string): string =>
  WIRE_PALETTE.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex;

/**
 * LEGACY COLOURS — how wires drawn before the user picked colours (schema 5)
 * were shown, by polarity, US/NEC practice (also used in
 * Jamaica): DC + red, DC − black; AC L1 black, L2 red, L3 blue, neutral
 * white, equipment ground green (bare copper shows as copper). Change here for
 * IEC colours (L brown, N blue, PE green-yellow).
 */
export const WIRE_COLOR: Record<string, string> = {
  "+": "#d33a2c",
  "-": "#1f2124",
  L1: "#26282c",
  L2: "#c8302a",
  L3: "#2f62c8",
  N: "#ececec",
  PE: "#2f9e44",
};
export const BARE_COPPER = "#c47a3c";
export const UNKNOWN_WIRE = "#8a6fd1";

/** Colour of a wire from its polarity and cable kind. */
export function wireColor(polarity: string | undefined, cableKind?: string): string {
  if (cableKind === "bare-ground") return BARE_COPPER;
  return (polarity && WIRE_COLOR[polarity]) || UNKNOWN_WIRE;
}

/** Terminal dot colour while wiring (same convention; ground green). */
export function terminalColor(polarity: string | undefined, type: string): string {
  if (type === "ground-point") return WIRE_COLOR.PE!;
  return (polarity && WIRE_COLOR[polarity]) || "#8f9aa6";
}

/** Extra length bought per wire: slack and a termination allowance at each end (installer practice). // VERIFY */
export const WIRE_SLACK_FRACTION = 0.1;
export const WIRE_END_ALLOWANCE_M = 0.15;
