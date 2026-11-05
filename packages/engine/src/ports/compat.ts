/**
 * Typed port compatibility (brief §3 "Typed ports"). Used by snapping (green
 * magnet vs red ghost) and by the DRC. The table below is the single place
 * that decides which port types may mate.
 */
export interface PortLike {
  type: string;
  gender?: "male" | "female" | undefined;
  polarity?: string | undefined;
}

export interface CompatResult {
  ok: boolean;
  reason: string;
}

/** Which port types may connect to which (symmetric). */
export const PORT_COMPATIBILITY: Record<string, readonly string[]> = {
  mc4: ["mc4"],
  "dc-lug": ["dc-terminal", "battery-terminal", "dc-lug"],
  "dc-terminal": ["dc-lug"],
  "battery-terminal": ["dc-lug"],
  "ac-terminal": ["ac-terminal"],
  "din-slot": ["din-slot"],
  "rail-slot": ["rail-slot", "clamp-seat"],
  "clamp-seat": ["rail-slot"],
  "roof-anchor": ["roof-anchor"],
  "conduit-end": ["conduit-end"],
  "ground-point": ["ground-point"],
};

/** Port types whose mating halves must have opposite gender. */
const GENDERED = new Set(["mc4"]);

export function canConnect(a: PortLike, b: PortLike): CompatResult {
  const allowed = PORT_COMPATIBILITY[a.type] ?? [];
  if (!allowed.includes(b.type))
    return { ok: false, reason: `${a.type} cannot connect to ${b.type}` };
  if (GENDERED.has(a.type)) {
    if (!a.gender || !b.gender)
      return { ok: false, reason: `${a.type} ends need a gender (male/female)` };
    if (a.gender === b.gender)
      return { ok: false, reason: `${a.gender}-to-${b.gender} ${a.type} connection is impossible` };
  }
  return { ok: true, reason: "compatible" };
}
