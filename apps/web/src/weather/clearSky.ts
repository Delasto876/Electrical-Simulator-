import {
  clearSkyGhiHaurwitz,
  dayOfYearUtc,
  decomposeErbs,
  extraterrestrialNormalWm2,
  sunPosition,
} from "@solar-sim/engine";
import type { WeatherSeries } from "./types";

/**
 * OFFLINE FALLBACK: cloudless sky (Haurwitz GHI split by Erbs) and an assumed
 * daily temperature swing. NOT weather data: production is an upper bound
 * and the UI says so.
 */
export function clearSkySeries(
  latitudeDeg: number,
  longitudeDeg: number,
  startMs: number,
  endMs: number,
  temps: { lowC: number; highC: number },
): WeatherSeries {
  const s: WeatherSeries = {
    source: "clear-sky",
    label: "Clear-sky estimate (no clouds; not weather data)",
    latitudeDeg,
    longitudeDeg,
    timesMs: [],
    ghiWm2: [],
    dniWm2: [],
    dhiWm2: [],
    tempC: [],
    windMs: [],
  };
  const first = Math.floor(startMs / 3_600_000) * 3_600_000;
  for (let t = first; t <= endMs + 3_600_000; t += 3_600_000) {
    const mid = t - 1_800_000; // hour-ending convention
    const sun = sunPosition(new Date(mid), latitudeDeg, longitudeDeg);
    const ghi = clearSkyGhiHaurwitz(sun.zenithDeg);
    const { dniWm2, dhiWm2 } = decomposeErbs(
      ghi,
      sun.zenithDeg,
      extraterrestrialNormalWm2(dayOfYearUtc(mid)),
    );
    // temperature: low at sunrise-ish, high mid-afternoon (solar time from the hour angle)
    const solarHour = 12 + sun.hourAngleDeg / 15;
    const swing = Math.cos(((solarHour - 15) / 24) * 2 * Math.PI);
    s.timesMs.push(t);
    s.ghiWm2.push(ghi);
    s.dniWm2.push(dniWm2);
    s.dhiWm2.push(dhiWm2);
    s.tempC.push((temps.lowC + temps.highC) / 2 + ((temps.highC - temps.lowC) / 2) * swing);
    s.windMs.push(1);
  }
  return s;
}
