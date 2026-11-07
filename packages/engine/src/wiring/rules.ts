import { issue, type Issue } from "../drc/issue";
import { circleArea, racewayFill, type FillResult } from "../raceway/fill";

/**
 * WIRE RULES — checks on a single wire between two terminals and on what a
 * raceway carries. Terminal types are the catalog port types (mc4,
 * dc-terminal, battery-terminal, ac-terminal, ground-point); polarities are
 * "+", "-", "L1", "L2", "L3", "N", "PE".
 */
export interface TerminalRef {
  id: string;
  label: string;
  type: string;
  polarity?: string | undefined;
  /** Highest voltage at this terminal, if known [V]. */
  voltageV?: number | undefined;
}

export interface CableRef {
  kind: string;
  maxVoltageV: number;
  outerDiameterMm: number;
}

/** Which side of the system a terminal type belongs to. */
export function terminalSide(type: string): "dc" | "ac" | "ground" | "other" {
  if (type === "ground-point") return "ground";
  if (type === "ac-terminal") return "ac";
  if (type === "mc4" || type === "dc-terminal" || type === "battery-terminal" || type === "dc-lug")
    return "dc";
  return "other";
}

/** Problems with one wire from terminal a to terminal b (errors stop it being drawn by the tool). */
export function wireProblems(
  wireId: string,
  a: TerminalRef,
  b: TerminalRef,
  cable?: CableRef,
): Issue[] {
  const out: Issue[] = [];
  const ids = [wireId];
  if (a.id === b.id) {
    out.push(
      issue(
        "error",
        "PORT_INCOMPATIBLE",
        `Both ends are ${a.label}.`,
        ids,
        "Pick a second terminal.",
      ),
    );
    return out;
  }
  const sa = terminalSide(a.type);
  const sb = terminalSide(b.type);
  if (sa !== sb && sa !== "other" && sb !== "other")
    out.push(
      issue(
        "error",
        "PORT_INCOMPATIBLE",
        `${a.label} is ${sa.toUpperCase()} but ${b.label} is ${sb.toUpperCase()}.`,
        ids,
        sa === "ground" || sb === "ground"
          ? "Ground conductors go from ground point to ground point (PE bar, lug, rod)."
          : "AC and DC circuits are never joined by a wire: go through the inverter or charger.",
      ),
    );
  else if (a.polarity && b.polarity && a.polarity !== b.polarity && sa !== "ground")
    out.push(
      issue(
        "error",
        "POLARITY",
        `${a.label} (${a.polarity}) is wired to ${b.label} (${b.polarity}).`,
        ids,
        "Join like to like: + to +, − to −, L to L, N to N.",
      ),
    );
  if (cable) {
    const v = Math.max(a.voltageV ?? 0, b.voltageV ?? 0);
    if (v > cable.maxVoltageV)
      out.push(
        issue(
          "error",
          "CABLE_VOLTAGE",
          `The cable is rated ${cable.maxVoltageV} V but the circuit reaches ${Math.round(v)} V.`,
          ids,
          "Use a cable rated for the circuit voltage (PV wire is rated 1000–2000 V).",
        ),
      );
    if (
      (sa === "ground" || sb === "ground") &&
      cable.kind !== "bare-ground" &&
      cable.kind !== "thhn-thwn-2"
    )
      out.push(
        issue(
          "warning",
          "PORT_INCOMPATIBLE",
          "A ground wire is normally bare copper or green-insulated building wire.",
          ids,
          "Pick a bare copper or green THHN conductor.",
        ),
      );
    if ((a.type === "mc4" || b.type === "mc4") && cable.kind !== "pv-wire")
      out.push(
        issue(
          "warning",
          "PORT_INCOMPATIBLE",
          "Module and string wiring with MC4 ends is PV wire (sunlight-resistant, double insulated).",
          ids,
          "Pick a PV wire.",
        ),
      );
  }
  return out;
}

/** Wires per terminal: MC4 takes exactly one; screw terminals two at most (most are listed for one). */
export function terminalLoadProblems(
  uses: ReadonlyMap<string, { terminal: TerminalRef; wireIds: string[] }>,
): Issue[] {
  const out: Issue[] = [];
  for (const { terminal, wireIds } of uses.values()) {
    const max = terminal.type === "mc4" ? 1 : 2;
    if (wireIds.length > max)
      out.push(
        issue(
          terminal.type === "mc4" ? "error" : "warning",
          "PORT_DOUBLE",
          `${wireIds.length} wires on ${terminal.label}${terminal.type === "mc4" ? " (an MC4 connector takes one)" : ""}.`,
          wireIds,
          "Use a busbar, terminal block or a branch connector listed for it.",
        ),
      );
  }
  return out;
}

/** Trunking / wireway fill: conductor area against the inside cross-section [mm, mm²]. */
export function trunkingFill(
  conductorOdsMm: readonly number[],
  internalWidthMm: number,
  internalHeightMm: number,
  limitPct: number,
): FillResult {
  return racewayFill(conductorOdsMm, internalWidthMm * internalHeightMm, limitPct);
}

/** Conduit fill: conductor area against the inside circle [mm]. */
export function conduitFill(
  conductorOdsMm: readonly number[],
  internalDiameterMm: number,
  limitPct: number,
): FillResult {
  return racewayFill(conductorOdsMm, circleArea(internalDiameterMm), limitPct);
}

/** RACEWAY_FILL issue when a run is over its limit. */
export function fillIssue(
  racewayId: string,
  name: string,
  f: FillResult,
  wireIds: string[],
): Issue[] {
  if (f.ok) return [];
  return [
    issue(
      "error",
      "RACEWAY_FILL",
      `${name} is ${f.fillPct.toFixed(0)} % full (${f.count} conductors); the limit is ${f.limitPct} %.`,
      [racewayId, ...wireIds],
      "Use a larger size, a second run, or fewer conductors.",
    ),
  ];
}
