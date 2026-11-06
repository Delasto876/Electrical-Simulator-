/**
 * LENGTH UNITS — display and parsing of lengths for the Workbench (mm, cm, m,
 * in, ft-in with fractions). Values are stored in metres. The full expression
 * parser (`600+25`, `2'6"`, `0.75m`, `1.5 ft`) is part of the precision system
 * (Phase 2); this covers a number with an optional unit, and feet-and-inches.
 */
export const UNITS = ["mm", "cm", "m", "in", "ft-in"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABEL: Record<Unit, string> = {
  mm: "mm",
  cm: "cm",
  m: "m",
  in: "in",
  "ft-in": "ft-in",
};

const M_PER = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 } as const;

/** Inches as a mixed fraction to the nearest 1/16, e.g. 7.5 → `7 1/2`. */
function fractionIn(inches: number): string {
  const sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  let n = sixteenths % 16;
  let d = 16;
  while (n > 0 && n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return n === 0 ? `${whole}` : whole === 0 ? `${n}/${d}` : `${whole} ${n}/${d}`;
}

/** Format a length [m] in a unit. */
export function formatLength(m: number, unit: Unit, digits = 0): string {
  if (!Number.isFinite(m)) return "—";
  switch (unit) {
    case "mm":
      return `${(m * 1000).toFixed(digits)} mm`;
    case "cm":
      return `${(m * 100).toFixed(Math.max(digits, 1))} cm`;
    case "m":
      return `${m.toFixed(Math.max(digits, 2))} m`;
    case "in":
      return `${(m / M_PER.in).toFixed(Math.max(digits, 1))} in`;
    case "ft-in": {
      const total = m / M_PER.in;
      const sign = total < 0 ? "-" : "";
      const a = Math.abs(total);
      const roundedSixteenths = Math.round(a * 16);
      const ft = Math.floor(roundedSixteenths / 16 / 12);
      const inch = roundedSixteenths / 16 - ft * 12;
      return `${sign}${ft}′ ${fractionIn(inch)}″`;
    }
  }
}

/** The number shown in an edit field for a length [m] in a unit (no unit text). */
export function lengthFieldValue(m: number, unit: Unit): string {
  switch (unit) {
    case "mm":
      return String(Math.round(m * 1000));
    case "cm":
      return String(Math.round(m * 1000) / 10);
    case "m":
      return String(Math.round(m * 1000) / 1000);
    case "in":
      return String(Math.round((m / M_PER.in) * 100) / 100);
    case "ft-in":
      return formatLength(m, "ft-in").replace("′ ", "'").replace("″", '"');
  }
}

const NUMBER = String.raw`[-+]?(?:\d+(?:\.\d+)?|\.\d+)`;

/**
 * Parse text typed into a length field. A bare number uses `defaultUnit`
 * (`ft-in` reads a bare number as feet). Returns metres, or undefined if the
 * text is not a length.
 */
export function parseLength(text: string, defaultUnit: Unit): number | undefined {
  const t = text.trim().replace(/[′]/g, "'").replace(/[″”“]/g, '"');
  if (!t) return undefined;
  // 2'6"  2' 6 1/2"  2'  6"
  const ftIn = new RegExp(
    String.raw`^(${NUMBER})\s*'\s*(?:(\d+(?:\.\d+)?)(?:\s+(\d+)/(\d+))?\s*"?)?$`,
  ).exec(t);
  if (ftIn) {
    const ft = Number(ftIn[1]);
    const inch = ftIn[2] ? Number(ftIn[2]) + (ftIn[3] ? Number(ftIn[3]) / Number(ftIn[4]) : 0) : 0;
    return (ft + Math.sign(ft || 1) * 0) * M_PER.ft + Math.sign(ft || 1) * inch * M_PER.in;
  }
  const inOnly = new RegExp(String.raw`^(${NUMBER})\s*(?:"|in|inch|inches)$`, "i").exec(t);
  if (inOnly) return Number(inOnly[1]) * M_PER.in;
  const m = new RegExp(String.raw`^(${NUMBER})\s*(mm|cm|m|ft|feet|foot)?$`, "i").exec(t);
  if (!m) return undefined;
  const v = Number(m[1]);
  const u = m[2]?.toLowerCase();
  if (u === "mm") return v * M_PER.mm;
  if (u === "cm") return v * M_PER.cm;
  if (u === "m") return v;
  if (u) return v * M_PER.ft;
  switch (defaultUnit) {
    case "mm":
      return v * M_PER.mm;
    case "cm":
      return v * M_PER.cm;
    case "m":
      return v;
    case "in":
      return v * M_PER.in;
    case "ft-in":
      return v * M_PER.ft;
  }
}
