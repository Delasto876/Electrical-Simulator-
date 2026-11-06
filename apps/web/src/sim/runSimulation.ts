import { simulate, type SimInput, type SimOutput } from "@solar-sim/engine";
import { buildSimInput, SimSetupError } from "../model/simModel";
import { sceneFor } from "../scene/useSceneModel";
import { useProject } from "../state/projectStore";
import { cacheKey, getCached, putCached } from "../weather/cache";
import { clearSkySeries } from "../weather/clearSky";
import { fetchArchive, WeatherError, WeatherUnreachableError } from "../weather/openMeteo";
import { buildSteps, fetchDates, periodRange } from "../weather/steps";
import type { WeatherSeries } from "../weather/types";
import { useSim } from "./simStore";

/** Weather for the project's site and period: cached Open-Meteo data, or the clear-sky estimate. */
export async function weatherFor(
  fetchImpl?: typeof fetch,
): Promise<{ series: WeatherSeries; startMs: number; endMs: number }> {
  const p = useProject.getState().project;
  const { startMs, endMs } = periodRange(p.simulation, p.site.timeZone);
  const clearSky = (why?: string) => {
    const mid = (p.climate.minAmbientC + p.climate.maxAmbientC) / 2;
    const series = clearSkySeries(p.site.latitudeDeg, p.site.longitudeDeg, startMs, endMs, {
      lowC: mid - 4,
      highC: mid + 4,
    });
    return {
      series: why ? { ...series, label: `${series.label} — ${why}` } : series,
      startMs,
      endMs,
    };
  };
  if (p.simulation.source === "clear-sky") return clearSky();
  const { startDate, endDate } = fetchDates(startMs, endMs);
  const key = cacheKey(p.site.latitudeDeg, p.site.longitudeDeg, startDate, endDate);
  let series = await getCached(key);
  if (!series) {
    try {
      series = await fetchArchive(
        p.site.latitudeDeg,
        p.site.longitudeDeg,
        startDate,
        endDate,
        fetchImpl,
      );
    } catch (e) {
      // No network (or a host that blocks it): say so and use the offline estimate.
      if (e instanceof WeatherUnreachableError)
        return clearSky("real weather could not be downloaded here, so this is NOT measured data");
      throw e;
    }
    await putCached(key, series);
  }
  return { series, startMs, endMs };
}

function runInWorker(input: SimInput): Promise<SimOutput> {
  if (typeof Worker === "undefined") return Promise.resolve(simulate(input));
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./simWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (
      e: MessageEvent<{ ok: true; out: SimOutput } | { ok: false; message: string }>,
    ) => {
      w.terminate();
      if (e.data.ok) resolve(e.data.out);
      else reject(new Error(e.data.message));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "simulation worker failed"));
    };
    w.postMessage(input);
  });
}

/** Fetch weather, build the input from the project and run the simulation. */
export async function runSimulation(fetchImpl?: typeof fetch): Promise<void> {
  const set = useSim.setState;
  const { project: p, revision } = useProject.getState();
  set({ status: "weather", message: null });
  try {
    const { series, startMs, endMs } = await weatherFor(fetchImpl);
    const steps = buildSteps(series, startMs, endMs, p.simulation.stepMin, p.site.timeZone);
    if (steps.length === 0) throw new WeatherError("No weather data for this period.");
    const input = buildSimInput(p, sceneFor(p, []), steps);
    set({ status: "running", weatherLabel: series.label });
    const output = await runInWorker(input);
    // start the slider at the sunniest moment of the first day
    let best = 0;
    const perDay = Math.round((24 * 60) / p.simulation.stepMin);
    for (let i = 0; i < Math.min(perDay, output.times.length); i++)
      if (output.channels.sunElevationDeg[i]! > output.channels.sunElevationDeg[best]!) best = i;
    set({ status: "done", output, revision, index: best, playing: false });
  } catch (e) {
    const known = e instanceof WeatherError || e instanceof SimSetupError;
    set({
      status: "error",
      message: known
        ? e.message
        : `Simulation failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
