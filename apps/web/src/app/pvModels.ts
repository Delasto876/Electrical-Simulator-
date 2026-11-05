import type { PvModule } from "@solar-sim/catalog";
import { fitDeSoto, SingleDiodeFitError, type SingleDiodeParams } from "@solar-sim/engine";
import { catalog } from "./catalog";

/** PV modules from the catalog. */
export const pvModules = catalog.filter((p): p is PvModule => p.category === "pv-module");

export type FitOutcome = { ok: true; params: SingleDiodeParams } | { ok: false; reason: string };

const cache = new Map<string, FitOutcome>();

/** Single-diode fit per catalog module, cached (a fit takes ~20 ms). */
export function moduleFit(m: PvModule): FitOutcome {
  const hit = cache.get(m.id);
  if (hit) return hit;
  let out: FitOutcome;
  try {
    out = { ok: true, params: fitDeSoto(m.electrical) };
  } catch (e) {
    out = { ok: false, reason: e instanceof SingleDiodeFitError ? e.message : String(e) };
  }
  cache.set(m.id, out);
  return out;
}
