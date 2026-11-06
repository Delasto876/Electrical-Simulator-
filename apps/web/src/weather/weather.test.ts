import { describe, expect, it } from "vitest";
import june from "./fixtures/kingston-2025-06.json";
import geo from "./fixtures/geocode-montego.json";
import {
  archiveUrl,
  fetchArchive,
  parseArchive,
  parsePlaces,
  searchPlaces,
  WeatherError,
} from "./openMeteo";
import { clearSkySeries } from "./clearSky";
import { buildSteps, fetchDates, periodRange } from "./steps";
import { localMidnightUtc, localParts, utcOffsetMin } from "./timezone";
import { cacheKey, getCached, putCached } from "./cache";

const TZ = "America/Jamaica";

describe("time zones", () => {
  it("Jamaica is UTC−5 all year; New York has DST", () => {
    expect(utcOffsetMin(Date.UTC(2025, 0, 15), TZ)).toBe(-300);
    expect(utcOffsetMin(Date.UTC(2025, 6, 15), TZ)).toBe(-300);
    expect(utcOffsetMin(Date.UTC(2025, 6, 15), "America/New_York")).toBe(-240);
    expect(localMidnightUtc("2025-06-01", TZ)).toBe(Date.UTC(2025, 5, 1, 5));
    expect(localMidnightUtc("2025-03-09", "America/New_York")).toBe(Date.UTC(2025, 2, 9, 5));
    expect(localParts(Date.UTC(2025, 5, 1, 17, 30), TZ)).toMatchObject({
      hour: 12,
      minute: 30,
      day: 1,
    });
  });
});

describe("Open-Meteo", () => {
  it("parses the archive (hour-ending UTC values) and the place search", () => {
    const w = parseArchive(june);
    expect(w.timesMs).toHaveLength(768);
    expect(w.timesMs[0]).toBe(Date.UTC(2025, 4, 31, 0));
    expect(Math.max(...w.ghiWm2)).toBeGreaterThan(800);
    expect(w.label).toMatch(/ERA5/);
    const places = parsePlaces(geo);
    expect(places[0]).toMatchObject({ name: "Montego Bay", timeZone: "America/Jamaica" });
    expect(places[0]!.label).toMatch(/Jamaica$/);
    expect(parsePlaces({ nope: 1 })).toEqual([]);
    expect(parsePlaces({})).toEqual([]);
  });
  it("builds a GMT, metric request and reports API and network errors", async () => {
    const u = new URL(archiveUrl(17.997, -76.7936, "2025-06-01", "2025-06-02"));
    expect(u.searchParams.get("timezone")).toBe("GMT");
    expect(u.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(() =>
      parseArchive({ error: true, reason: "Parameter 'start_date' is out of range" }),
    ).toThrow(/out of range/);
    expect(() => parseArchive(null)).toThrow(WeatherError);
    const ok = (body: unknown, status = 200) =>
      (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(
      fetchArchive(18, -77, "2025-06-01", "2025-06-30", ok(june)),
    ).resolves.toMatchObject({ source: "open-meteo" });
    await expect(
      fetchArchive(18, -77, "x", "y", ok({ error: true, reason: "bad date" }, 400)),
    ).rejects.toThrow(/bad date/);
    const down = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await expect(fetchArchive(18, -77, "a", "b", down)).rejects.toThrow(/offline/);
    await expect(searchPlaces("Kingston", ok(geo))).resolves.toHaveLength(2);
    await expect(searchPlaces("Kingston", down)).rejects.toThrow(WeatherError);
  });
});

describe("steps", () => {
  const w = parseArchive(june);
  it("a local day in Kingston is 05:00–05:00 UTC; hourly steps take the hour's own value", () => {
    const r = periodRange({ period: "day", date: "2025-06-01" }, TZ);
    expect(r).toEqual({ startMs: Date.UTC(2025, 5, 1, 5), endMs: Date.UTC(2025, 5, 2, 5) });
    expect(fetchDates(r.startMs, r.endMs)).toEqual({
      startDate: "2025-06-01",
      endDate: "2025-06-02",
    });
    const s = buildSteps(w, r.startMs, r.endMs, 60, TZ);
    expect(s).toHaveLength(24);
    expect(s[0]!.localHour).toBeCloseTo(0.5, 9);
    expect(s[0]!.dayKey).toBe("2025-06-01");
    // 12:30 local = 17:30 UTC = the hour ending 18:00 UTC
    const i = w.timesMs.indexOf(Date.UTC(2025, 5, 1, 18));
    expect(s[12]!.ghiWm2).toBeCloseTo(w.ghiWm2[i]!, 6);
    expect(s[12]!.tempC).toBeCloseTo(w.tempC[i]!, 6);
  });
  it("15-minute steps interpolate between hour centres; month and year ranges", () => {
    const r = periodRange({ period: "day", date: "2025-06-01" }, TZ);
    const s = buildSteps(w, r.startMs, r.endMs, 15, TZ);
    expect(s).toHaveLength(96);
    const m = periodRange({ period: "month", date: "2025-06-17" }, TZ);
    expect(m.endMs - m.startMs).toBe(30 * 86_400_000);
    const y = periodRange({ period: "year", date: "2025-06-17" }, TZ);
    expect(y.startMs).toBe(Date.UTC(2025, 0, 1, 5));
    expect(buildSteps(w, m.startMs, m.endMs, 60, TZ)).toHaveLength(720);
  });
  it("clear-sky fallback: sunny days, no clouds, plausible temperatures", () => {
    const r = periodRange({ period: "day", date: "2025-06-01" }, TZ);
    const c = clearSkySeries(18, -76.8, r.startMs, r.endMs, { lowC: 24, highC: 32 });
    expect(Math.max(...c.ghiWm2)).toBeGreaterThan(950);
    expect(Math.min(...c.tempC)).toBeGreaterThanOrEqual(24 - 1e-9);
    expect(Math.max(...c.tempC)).toBeLessThanOrEqual(32 + 1e-9);
    expect(buildSteps(c, r.startMs, r.endMs, 60, TZ)).toHaveLength(24);
  });
  it("caches series in memory when IndexedDB is not available", async () => {
    const k = cacheKey(18, -77, "2025-06-01", "2025-06-02");
    expect(await getCached(k)).toBeUndefined();
    await putCached(k, w);
    expect((await getCached(k))?.timesMs.length).toBe(768);
  });
});

describe("weather when Open-Meteo cannot be reached", () => {
  it("falls back to the clear-sky estimate and says so in the label", async () => {
    const { weatherFor } = await import("../sim/runSimulation");
    const { useProject } = await import("../state/projectStore");
    useProject.getState().replace({
      ...useProject.getState().project,
      simulation: {
        ...useProject.getState().project.simulation,
        source: "open-meteo",
        date: "2019-03-02",
      },
    });
    const offline = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    const w = await weatherFor(offline);
    expect(w.series.source).toBe("clear-sky");
    expect(w.series.label).toMatch(/NOT measured data/);
  });

  it("still reports other Open-Meteo errors", async () => {
    const { weatherFor } = await import("../sim/runSimulation");
    const bad = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: true, reason: "Bad date" }), { status: 400 }),
      )) as typeof fetch;
    const { useProject } = await import("../state/projectStore");
    useProject.getState().replace({
      ...useProject.getState().project,
      simulation: {
        ...useProject.getState().project.simulation,
        source: "open-meteo",
        date: "2019-03-03",
      },
    });
    await expect(weatherFor(bad)).rejects.toThrow(/Bad date/);
  });
});
