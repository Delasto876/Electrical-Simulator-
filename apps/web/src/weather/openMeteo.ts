import { z } from "zod";
import type { Place, WeatherSeries } from "./types";

/**
 * OPEN-METEO (https://open-meteo.com): free, no key, global, browser-friendly
 * (CORS). Historical hourly weather from the ERA5 reanalysis, and place
 * search (GeoNames). Data licence: CC BY 4.0 — credit "Weather data by
 * Open-Meteo.com" wherever results are shown.
 */
export const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
export const OPEN_METEO_GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";
export const OPEN_METEO_CREDIT = "Weather data by Open-Meteo.com (ERA5 reanalysis, CC BY 4.0)";

const HOURLY = [
  "temperature_2m",
  "shortwave_radiation",
  "direct_normal_irradiance",
  "diffuse_radiation",
  "wind_speed_10m",
] as const;

export function archiveUrl(
  latitudeDeg: number,
  longitudeDeg: number,
  startDate: string,
  endDate: string,
): string {
  const q = new URLSearchParams({
    latitude: latitudeDeg.toFixed(4),
    longitude: longitudeDeg.toFixed(4),
    start_date: startDate,
    end_date: endDate,
    hourly: HOURLY.join(","),
    timezone: "GMT",
    wind_speed_unit: "ms",
  });
  return `${OPEN_METEO_ARCHIVE}?${q.toString()}`;
}

const nums = z.array(z.number().nullable());
const ArchiveResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().optional(),
  utc_offset_seconds: z.literal(0),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: nums,
    shortwave_radiation: nums,
    direct_normal_irradiance: nums,
    diffuse_radiation: nums,
    wind_speed_10m: nums,
  }),
});

export class WeatherError extends Error {}

/** Parse an archive response. Missing values: radiation → 0, temperature/wind → previous value. */
export function parseArchive(json: unknown): WeatherSeries {
  const r = ArchiveResponse.safeParse(json);
  if (!r.success) {
    const reason = (json as { reason?: unknown } | null)?.reason;
    throw new WeatherError(
      typeof reason === "string" ? `Open-Meteo: ${reason}` : "Unexpected response from Open-Meteo",
    );
  }
  const h = r.data.hourly;
  const fill = (a: (number | null)[], zero: boolean) => {
    let last = 0;
    return a.map((v) => {
      if (v === null) return zero ? 0 : last;
      last = v;
      return v;
    });
  };
  return {
    source: "open-meteo",
    label: `Open-Meteo ERA5 hourly, grid point ${r.data.latitude.toFixed(2)}°, ${r.data.longitude.toFixed(2)}°`,
    latitudeDeg: r.data.latitude,
    longitudeDeg: r.data.longitude,
    timesMs: h.time.map((t) => Date.parse(`${t}:00Z`)),
    ghiWm2: fill(h.shortwave_radiation, true),
    dniWm2: fill(h.direct_normal_irradiance, true),
    dhiWm2: fill(h.diffuse_radiation, true),
    tempC: fill(h.temperature_2m, false),
    windMs: fill(h.wind_speed_10m, false),
  };
}

export async function fetchArchive(
  latitudeDeg: number,
  longitudeDeg: number,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherSeries> {
  let res: Response;
  try {
    res = await fetchImpl(archiveUrl(latitudeDeg, longitudeDeg, startDate, endDate));
  } catch {
    throw new WeatherError(
      "Could not reach Open-Meteo (offline?). Use the clear-sky estimate or try again.",
    );
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) parseArchive(json); // throws with the API's reason
  return parseArchive(json);
}

const GeoResponse = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().optional(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

export function parsePlaces(json: unknown): Place[] {
  const r = GeoResponse.safeParse(json);
  if (!r.success) return [];
  return (r.data.results ?? []).map((p) => ({
    name: p.name,
    label: [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : undefined, p.country]
      .filter(Boolean)
      .join(", "),
    latitudeDeg: p.latitude,
    longitudeDeg: p.longitude,
    timeZone: p.timezone ?? "UTC",
  }));
}

export async function searchPlaces(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Place[]> {
  const q = new URLSearchParams({ name, count: "8", language: "en", format: "json" });
  try {
    const res = await fetchImpl(`${OPEN_METEO_GEOCODING}?${q.toString()}`);
    return parsePlaces(await res.json());
  } catch {
    throw new WeatherError(
      "Could not reach the place search (offline?). Enter latitude and longitude instead.",
    );
  }
}
