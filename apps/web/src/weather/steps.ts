import type { SimStep } from "@solar-sim/engine";
import type { SimulationSettings } from "../project/projectFile";
import { isoDate, localMidnightUtc, localParts } from "./timezone";
import type { WeatherSeries } from "./types";

/** UTC range [start, end) of the simulated local period (day, month or year starting at `date`). */
export function periodRange(
  sim: Pick<SimulationSettings, "period" | "date">,
  tz: string,
): { startMs: number; endMs: number } {
  const [y, m, d] = sim.date.split("-").map(Number) as [number, number, number];
  const startDate =
    sim.period === "day"
      ? sim.date
      : sim.period === "month"
        ? isoDate({ year: y, month: m, day: 1 })
        : isoDate({ year: y, month: 1, day: 1 });
  const end =
    sim.period === "day"
      ? new Date(Date.UTC(y, m - 1, d + 1))
      : sim.period === "month"
        ? new Date(Date.UTC(y, m, 1))
        : new Date(Date.UTC(y + 1, 0, 1));
  const endDate = isoDate({
    year: end.getUTCFullYear(),
    month: end.getUTCMonth() + 1,
    day: end.getUTCDate(),
  });
  return { startMs: localMidnightUtc(startDate, tz), endMs: localMidnightUtc(endDate, tz) };
}

/** UTC calendar dates to request so the whole local period (hour-ending data) is covered. */
export function fetchDates(startMs: number, endMs: number): { startDate: string; endDate: string } {
  const a = new Date(startMs - 3_600_000);
  const b = new Date(endMs + 3_600_000);
  const d = (x: Date) =>
    isoDate({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() });
  return { startDate: d(a), endDate: d(b) };
}

/**
 * Simulation steps of `stepMin` minutes over [startMs, endMs). Each step takes
 * the weather at its middle, linearly interpolated between hour centres
 * (an hour-ending value belongs to the middle of its hour).
 */
export function buildSteps(
  w: WeatherSeries,
  startMs: number,
  endMs: number,
  stepMin: number,
  tz: string,
): SimStep[] {
  const centres = w.timesMs.map((t) => t - 1_800_000);
  const out: SimStep[] = [];
  const step = stepMin * 60_000;
  let j = 0;
  for (let t = startMs; t < endMs; t += step) {
    const mid = t + step / 2;
    while (j + 1 < centres.length && centres[j + 1]! <= mid) j++;
    const a = centres[j];
    if (a === undefined) break;
    const b = centres[j + 1];
    const f = b !== undefined && b > a && mid > a ? Math.min(1, (mid - a) / (b - a)) : 0;
    const at = (arr: number[]) => (arr[j] ?? 0) + f * ((arr[j + 1] ?? arr[j] ?? 0) - (arr[j] ?? 0));
    const lp = localParts(mid, tz);
    out.push({
      ms: mid,
      localHour: lp.hour + lp.minute / 60 + lp.second / 3600,
      dayKey: isoDate(lp),
      month: lp.month - 1,
      ghiWm2: Math.max(0, at(w.ghiWm2)),
      dniWm2: Math.max(0, at(w.dniWm2)),
      dhiWm2: Math.max(0, at(w.dhiWm2)),
      tempC: at(w.tempC),
      windMs: Math.max(0, at(w.windMs)),
    });
  }
  return out;
}
