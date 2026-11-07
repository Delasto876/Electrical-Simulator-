/**
 * ICON TONES — the colour gradients the ribbon icons are drawn with, like the
 * coloured tool icons of a CAD package: each toolbar group has its own hue
 * (CREATE blue, MODIFY orange, ASSEMBLE green, CONSTRUCT amber, INSPECT violet,
 * INSERT teal, SELECT slate). Rendered once; CSS points `stroke`/`fill` at them.
 * Gradients use the icon's own 24 × 24 user space so straight lines keep their colour.
 */
export const TONES = {
  blue: ["#7cc4ff", "#1f6fd1"],
  orange: ["#ffc06a", "#e0651a"],
  green: ["#7fe8a6", "#1c9450"],
  amber: ["#ffe07a", "#d08a0c"],
  violet: ["#cfa8ff", "#7446db"],
  teal: ["#72ece2", "#0f9488"],
  slate: ["#d5dde6", "#7a8899"],
  red: ["#ff9a8a", "#d23a2a"],
} as const;
export type Tone = keyof typeof TONES;

const BY_GROUP: Record<string, Tone> = {
  CREATE: "blue",
  MODIFY: "orange",
  ASSEMBLE: "green",
  CONSTRUCT: "amber",
  INSPECT: "violet",
  WIRE: "red",
  INSERT: "teal",
  SELECT: "slate",
};
const CYCLE: Tone[] = ["blue", "green", "orange", "violet", "teal", "amber", "red"];

/** The tone of a ribbon group: by its name for the BUILD groups, else by position. */
export function toneOf(label: string, index: number): Tone {
  return BY_GROUP[label.toUpperCase()] ?? CYCLE[index % CYCLE.length]!;
}

export function IconTones() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
      <defs>
        {Object.entries(TONES).map(([k, [a, b]]) => (
          <g key={k}>
            <linearGradient
              id={`wbg-${k}`}
              x1="0"
              y1="0"
              x2="24"
              y2="24"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
            <linearGradient
              id={`wbg-${k}-soft`}
              x1="0"
              y1="0"
              x2="24"
              y2="24"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={a} stopOpacity="0.28" />
              <stop offset="1" stopColor={b} stopOpacity="0.16" />
            </linearGradient>
          </g>
        ))}
      </defs>
    </svg>
  );
}
