/**
 * Turn a catalog part's nested spec object into display rows. This is pure
 * formatting (labels and units from the field-name suffix), not physics.
 */
export interface SpecRow {
  label: string;
  value: string;
}

const UNIT_SUFFIXES: [suffix: string, unit: string][] = [
  ["PctPerC", "%/°C"],
  ["Pct", "%"],
  ["Mohm", "mΩ"],
  ["Mm", "mm"],
  ["Kg", "kg"],
  ["Hz", "Hz"],
  ["Ah", "Ah"],
  ["W", "W"],
  ["V", "V"],
  ["A", "A"],
  ["S", "s"],
  ["C", "°C"],
];

const ACRONYMS: Record<string, string> = {
  pmax: "Pmax",
  voc: "Voc",
  vmp: "Vmp",
  isc: "Isc",
  imp: "Imp",
  noct: "NOCT",
  mppt: "MPPT",
  pv: "PV",
  ac: "AC",
  dc: "DC",
  bms: "BMS",
  do: "Do",
  d: "D",
};

export function labelFor(key: string): { label: string; unit: string | undefined } {
  let base = key;
  let unit: string | undefined;
  for (const [suffix, u] of UNIT_SUFFIXES) {
    if (key.length > suffix.length && key.endsWith(suffix)) {
      base = key.slice(0, -suffix.length);
      unit = u;
      break;
    }
  }
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase());
  const label = words.join(" ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), unit };
}

function formatValue(v: unknown, unit: string | undefined): string {
  if (typeof v === "number") return unit ? `${v} ${unit}` : String(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return `${v.length} entries`;
  return "—";
}

/** Flatten one level of nesting ("battery.minV" → "Battery · min"). Arrays are summarised. */
export function specRows(spec: Record<string, unknown>, prefix = ""): SpecRow[] {
  const rows: SpecRow[] = [];
  for (const [key, value] of Object.entries(spec)) {
    const { label, unit } = labelFor(key);
    const full = prefix ? `${prefix} · ${label.toLowerCase()}` : label;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      rows.push(...specRows(value as Record<string, unknown>, label));
    } else {
      rows.push({ label: full, value: formatValue(value, unit) });
    }
  }
  return rows;
}
