import type { Kit, KitDevice } from "../../config/kits";
import { partInfo } from "./partInfo";

/**
 * COMBINER BUILDER — a PV combiner box laid out from a few choices: how many
 * strings come in, how many outputs go to the inverter, the string protection
 * (2P DC breaker, or a fuse in + and in −), an SPD and a DC isolator per output.
 *
 * Layout on one DIN rail, left to right: the inputs (IN1, IN2 …), then per
 * output its busbar (only when several inputs share it), isolator and SPD.
 * Inputs are shared out in order: with 4 in and 2 out, IN1–IN2 feed OUT1 and
 * IN3–IN4 feed OUT2. Device names carry IN/OUT so their terminals read
 * "IN1 · … · line +" in the Wire tool. The smallest box that fits is used.
 *
 * The options are encoded in the kit id (`pvc-4in-2out-mcb-spd-iso`), so a
 * built box needs no stored state: `kitOf` rebuilds it from the card id.
 */
export interface CombinerOptions {
  inputs: number;
  outputs: number;
  protection: "mcb" | "fuse";
  spd: boolean;
  isolator: boolean;
}

export const COMBINER_LIMITS = { maxInputs: 8, maxOutputs: 4, maxPerBusbar: 4 } as const;

const MCB = "generic-mcb-dc-2p-20a";
const FUSE = "generic-fuse-holder-dc-15a";
const SPD = "generic-spd-dc-2p-1000v";
const ISO = "generic-isolator-dc-2p-32a";
const BUS = (n: number) => (n <= 2 ? "generic-din-busbar-dc-2way" : "generic-din-busbar-dc-4way");
/** Boxes from small to large (the 24 and 36 module boxes have two rails). */
const BOXES = [
  "ht-enclosure-4way",
  "ht-enclosure-5way",
  "ht-enclosure-8way",
  "ht-enclosure-12way",
  "ht-enclosure-15way",
  "ht-enclosure-18way",
  "generic-enclosure-24m-metal",
  "generic-enclosure-36m-metal",
];

/** Devices in order onto the rails of a box, a device that does not fit going to the next rail. */
function wrap(
  list: { catalogId: string; label: string; modules: number }[],
  perRow: number,
  rows: number,
): KitDevice[] | undefined {
  const out: KitDevice[] = [];
  let row = 0;
  let slot = 0;
  for (const d of list) {
    if (d.modules > perRow) return undefined;
    if (slot + d.modules > perRow) {
      row += 1;
      slot = 0;
    }
    if (row >= rows) return undefined;
    out.push({ catalogId: d.catalogId, row, slot, label: d.label });
    slot += d.modules;
  }
  return out;
}

export const COMBINER_PREFIX = "pvc-";

export function combinerId(o: CombinerOptions): string {
  return `${COMBINER_PREFIX}${o.inputs}in-${o.outputs}out-${o.protection}${o.spd ? "-spd" : ""}${o.isolator ? "-iso" : ""}`;
}

export function parseCombinerId(id: string): CombinerOptions | undefined {
  const m = /^pvc-(\d+)in-(\d+)out-(mcb|fuse)(-spd)?(-iso)?$/.exec(id);
  if (!m) return undefined;
  return {
    inputs: Number(m[1]),
    outputs: Number(m[2]),
    protection: m[3] as "mcb" | "fuse",
    spd: !!m[4],
    isolator: !!m[5],
  };
}

/** Why these options cannot be built, or undefined. */
export function combinerProblem(o: CombinerOptions): string | undefined {
  const L = COMBINER_LIMITS;
  if (!Number.isInteger(o.inputs) || o.inputs < 1 || o.inputs > L.maxInputs)
    return `Inputs must be 1 to ${L.maxInputs}.`;
  if (!Number.isInteger(o.outputs) || o.outputs < 1 || o.outputs > L.maxOutputs)
    return `Outputs must be 1 to ${L.maxOutputs}.`;
  if (o.outputs > o.inputs)
    return "More outputs than inputs: each output needs at least one string.";
  if (Math.ceil(o.inputs / o.outputs) > L.maxPerBusbar)
    return `At most ${L.maxPerBusbar} strings per output (busbar ways); add an output.`;
  return undefined;
}

/** Which inputs feed each output (1-based), in order. */
export function inputsPerOutput(o: CombinerOptions): number[][] {
  const out: number[][] = [];
  let next = 1;
  for (let j = 0; j < o.outputs; j++) {
    const n = Math.floor(o.inputs / o.outputs) + (j < o.inputs % o.outputs ? 1 : 0);
    out.push(Array.from({ length: n }, (_, i) => next + i));
    next += n;
  }
  return out;
}

const mods = (id: string) => partInfo(id)?.dinModules ?? 0;

export function buildCombiner(o: CombinerOptions): Kit | undefined {
  if (combinerProblem(o)) return undefined;
  const list: { catalogId: string; label: string; modules: number }[] = [];
  const put = (catalogId: string, label: string) =>
    list.push({ catalogId, label, modules: mods(catalogId) });
  for (let i = 1; i <= o.inputs; i++) {
    if (o.protection === "mcb") put(MCB, `IN${i}`);
    else {
      put(FUSE, `IN${i}+`);
      put(FUSE, `IN${i}−`);
    }
  }
  inputsPerOutput(o).forEach((ins, j) => {
    const out = `OUT${j + 1}`;
    if (ins.length > 1) put(BUS(ins.length), `${out} bus`);
    if (o.isolator) put(ISO, out);
    if (o.spd) put(SPD, `${out} SPD`);
  });
  let enclosureId: string | undefined;
  let devices: KitDevice[] | undefined;
  for (const b of BOXES) {
    const enc = partInfo(b)?.enclosure;
    devices = enc ? wrap(list, enc.modulesPerRow, enc.rows) : undefined;
    if (devices) {
      enclosureId = b;
      break;
    }
  }
  if (!enclosureId || !devices) return undefined;
  const prot = o.protection === "mcb" ? "2P 20 A DC breaker" : "15 A gPV fuse in + and −";
  return {
    id: combinerId(o),
    name: `PV combiner ${o.inputs}-in ${o.outputs}-out`,
    description: `${o.inputs} string${o.inputs === 1 ? "" : "s"} in (${prot} each), ${o.outputs} output${o.outputs === 1 ? "" : "s"}${o.isolator ? " with a DC isolator" : ""}${o.spd ? " and a type 2 DC SPD" : ""}${o.inputs > o.outputs ? "; strings joined on a busbar per output" : ""}.`,
    enclosureId,
    devices,
    tags: ["combiner", "PV", `${o.inputs} in ${o.outputs} out`, "DC", ...(o.spd ? ["SPD"] : [])],
  };
}

/** The ready-made combiner presets (C2). */
export const COMBINER_PRESETS: readonly CombinerOptions[] = [
  { inputs: 1, outputs: 1, protection: "mcb", spd: true, isolator: true },
  { inputs: 2, outputs: 1, protection: "mcb", spd: true, isolator: true },
  { inputs: 3, outputs: 1, protection: "mcb", spd: true, isolator: true },
  { inputs: 4, outputs: 1, protection: "fuse", spd: true, isolator: true },
  { inputs: 4, outputs: 2, protection: "mcb", spd: true, isolator: false },
  { inputs: 6, outputs: 2, protection: "fuse", spd: true, isolator: true },
  { inputs: 8, outputs: 4, protection: "fuse", spd: true, isolator: false },
];
