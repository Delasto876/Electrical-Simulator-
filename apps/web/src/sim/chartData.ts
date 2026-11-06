import type { SimOutput } from "@solar-sim/engine";
import { localParts } from "../weather/timezone";

/** Chart rows from simulation results (unit conversion only: W → kW, SoC → %). */
export interface PowerRow {
  i: number;
  label: string;
  pv: number;
  load: number;
  battery: number;
  gridImport: number;
  gridExport: number;
  gen: number;
  unmet: number;
  soc: number;
}

const kw = (w: number) => Math.round(w) / 1000;

export function timeLabel(out: SimOutput, i: number, tz: string): string {
  const t = out.times[i];
  if (t === undefined) return "";
  // label the start of the step
  const p = localParts(t - (out.stepMin * 60_000) / 2, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** One row per step (day and month views). */
export function powerRows(out: SimOutput, tz: string): PowerRow[] {
  const c = out.channels;
  return Array.from(out.times, (_, i) => ({
    i,
    label: timeLabel(out, i, tz).slice(5),
    pv: kw(c.pvAcW[i]! + c.pvToBatteryW[i]!), // PV used: AC out + DC into the battery
    load: kw(c.loadW[i]!),
    battery: kw(c.batteryW[i]!),
    gridImport: kw(c.gridImportW[i]!),
    gridExport: kw(c.gridExportW[i]!),
    gen: kw(c.genW[i]!),
    unmet: kw(c.unmetW[i]!),
    soc: Math.round(c.soc[i]! * 1000) / 10,
  }));
}

export interface EnergyRow {
  label: string;
  pv: number;
  load: number;
  gridImport: number;
  gridExport: number;
  gen: number;
  unmet: number;
  pshGhi: number;
  pshPoa: number;
  minSoc: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Per-day (month view) or per-month (year view) energy and peak sun hours. */
export function energyRows(out: SimOutput, by: "day" | "month"): EnergyRow[] {
  const rows = by === "day" ? out.daily : out.monthly;
  const days = (key: string) =>
    out.daily.filter((d) => Number(d.key.slice(5, 7)) - 1 === Number(key)).length || 1;
  return rows.map((r) => {
    const n = by === "month" ? days(r.key) : 1;
    return {
      label: by === "day" ? r.key.slice(5) : (MONTHS[Number(r.key)] ?? r.key),
      pv: r2(r.pvKWh),
      load: r2(r.loadKWh),
      gridImport: r2(r.gridImportKWh),
      gridExport: r2(r.gridExportKWh),
      gen: r2(r.genKWh),
      unmet: r2(r.unmetKWh),
      // peak sun hours are per day: average over the month's days
      pshGhi: r2(r.pshGhi / n),
      pshPoa: r2(r.pshPoa / n),
      minSoc: Math.round(r.minSoc * 100),
    };
  });
}

/** Loss waterfall: energy left after each step and what the step lost [kWh]. */
export function waterfallRows(
  out: SimOutput,
): { label: string; kWh: number; loss: number; lossPct: number }[] {
  const first = out.waterfall[0]?.kWh ?? 0;
  return out.waterfall.map((w, k) => {
    const prev = k === 0 ? w.kWh : out.waterfall[k - 1]!.kWh;
    const loss = Math.max(0, prev - w.kWh);
    return {
      label: w.label,
      kWh: r2(w.kWh),
      loss: r2(loss),
      lossPct: first > 0 ? r2((100 * loss) / first) : 0,
    };
  });
}
