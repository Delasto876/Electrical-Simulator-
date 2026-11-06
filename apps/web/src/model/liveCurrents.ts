import { isCategory } from "@solar-sim/catalog";
import { loadPowerW, type SimOutput } from "@solar-sim/engine";
import { catalogById } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import { localParts } from "../weather/timezone";
import { parsePortKey } from "./ports";
import type { SceneModel } from "./sceneModel";
import { loadProfileOf } from "./simModel";

/**
 * Approximate current in every cable at one simulation step [A], for the
 * live view: string home runs carry their string current, other PV runs the
 * sum of the strings, battery runs the battery current (split between
 * parallel batteries on their own leads), load circuits their load, the AC
 * input the grid import and the AC output bus the total load.
 */
export function cableCurrentsAt(
  p: ProjectFile,
  scene: SceneModel,
  out: SimOutput,
  i: number,
): Map<string, number> {
  const e = scene.electrical;
  const cur = new Map<string, number>();
  const t = out.times[i];
  if (t === undefined) return cur;
  const lp = localParts(t, p.site.timeZone);
  const hour = lp.hour + lp.minute / 60;
  const homeRuns = new Set<string>();
  let pvTotal = 0;
  for (const s of e.strings.values()) {
    const a = out.stringCurrents[s.string.id]?.[i] ?? 0;
    pvTotal += a;
    for (const c of [s.posCable, s.negCable])
      if (c) {
        cur.set(c.cable.id, a);
        homeRuns.add(c.cable.id);
      }
  }
  const inv = [...e.inverters.values()][0];
  const batV = inv?.battery?.part.electrical.nominalV ?? 48;
  const batCount = inv?.battery?.count ?? 1;
  const batA = Math.abs(out.channels.batteryW[i] ?? 0) / batV;
  const acOut = inv?.part.electrical.acOutput;
  const vLn = acOut?.lineToNeutralV ?? acOut?.voltageV ?? 230;
  const vLl = acOut?.voltageV ?? 230;
  const ownerCat = (k: string) => {
    const pk = parsePortKey(k);
    if (pk?.kind !== "part") return undefined;
    const part = p.parts.find((x) => x.id === pk.partId);
    return part ? { part, cat: catalogById.get(part.catalogId) } : undefined;
  };
  for (const c of e.cables.values()) {
    if (homeRuns.has(c.cable.id)) continue;
    const ends = [c.a, c.b];
    if (ends.some((x) => x?.port.type === "ground-point")) {
      cur.set(c.cable.id, 0);
      continue;
    }
    if (c.circuit === "pv" || ends.some((x) => x?.port.type === "mc4")) {
      cur.set(c.cable.id, pvTotal);
      continue;
    }
    if (c.circuit === "battery" || ends.some((x) => x?.port.type === "battery-terminal")) {
      const atInverter = [c.cable.from, c.cable.to].some(
        (k) => ownerCat(k)?.cat?.category === "inverter",
      );
      cur.set(c.cable.id, atInverter ? batA : batA / batCount);
      continue;
    }
    // AC: a load's own circuit, the inverter input (grid) or the output bus
    const load = [c.cable.from, c.cable.to]
      .map(ownerCat)
      .find((o) => o?.cat && isCategory(o.cat, "load"));
    if (load?.cat && isCategory(load.cat, "load")) {
      cur.set(
        c.cable.id,
        loadPowerW(load.cat.load.powerW, loadProfileOf(p, load.part.id), hour) / vLn,
      );
      continue;
    }
    const toAcIn =
      ends.some((x) => x?.port.group === "ac-in") ||
      [c.a, c.b].some((x) => /^s\d/.test(x?.port.group ?? ""));
    cur.set(
      c.cable.id,
      (toAcIn
        ? (out.channels.gridImportW[i] ?? 0) + (out.channels.genW[i] ?? 0)
        : (out.channels.loadW[i] ?? 0)) / vLl,
    );
  }
  return cur;
}

/** Colour for a current as a share of the cable's ampacity: blue → amber → red. */
export function currentColor(ratio: number): string {
  const r = Math.min(1, Math.max(0, ratio));
  const lerp = (a: number, b: number, f: number) => Math.round(a + (b - a) * f);
  const [c0, c1] =
    r < 0.5
      ? [
          [30, 144, 255],
          [255, 196, 0],
        ]
      : [
          [255, 196, 0],
          [230, 40, 20],
        ];
  const f = r < 0.5 ? r / 0.5 : (r - 0.5) / 0.5;
  return `rgb(${lerp(c0![0]!, c1![0]!, f)}, ${lerp(c0![1]!, c1![1]!, f)}, ${lerp(c0![2]!, c1![2]!, f)})`;
}
