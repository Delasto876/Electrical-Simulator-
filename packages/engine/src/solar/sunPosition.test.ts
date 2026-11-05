import { describe, expect, it } from "vitest";
import { julianDay, refractionDeg, sunPosition } from "./sunPosition";

describe("julianDay", () => {
  it("J2000.0 epoch is JD 2451545.0 (2000-01-01 12:00 TT ≈ UT)", () => {
    expect(julianDay(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(2451545);
  });
});

describe("sunPosition", () => {
  it("matches the NREL SPA reference case within 0.03°", () => {
    // Reda & Andreas (2004/2008), "Solar Position Algorithm for Solar Radiation
    // Applications", NREL/TP-560-34302, Table A4.1 example:
    // 2003-10-17 12:30:30 local time, UTC−7, lat 39.742476°, lon −105.1786°.
    // Topocentric zenith 50.11162°, azimuth (from north, eastward) 194.34024°.
    // SPA uses 820 mbar / 11 °C for refraction vs NOAA's standard atmosphere,
    // which accounts for a few thousandths of a degree.
    const p = sunPosition(new Date(Date.UTC(2003, 9, 17, 19, 30, 30)), 39.742476, -105.1786);
    expect(p.zenithDeg).toBeCloseTo(50.11162, 1);
    expect(Math.abs(p.zenithDeg - 50.11162)).toBeLessThan(0.03);
    expect(Math.abs(p.azimuthDeg - 194.34024)).toBeLessThan(0.03);
  });

  it("declination is ≈ +23.44° at the June 2024 solstice", () => {
    // Solstice 2024-06-20 20:51 UTC (US Naval Observatory, Earth's Seasons 2024).
    const p = sunPosition(new Date(Date.UTC(2024, 5, 20, 20, 51)), 0, 0);
    expect(Math.abs(p.declinationDeg - 23.44)).toBeLessThan(0.01);
  });

  it("declination is ≈ 0° at the March 2024 equinox", () => {
    // Equinox 2024-03-20 03:06 UTC (USNO).
    const p = sunPosition(new Date(Date.UTC(2024, 2, 20, 3, 6)), 0, 0);
    expect(Math.abs(p.declinationDeg)).toBeLessThan(0.01);
  });

  it("equation of time reaches about +16.4 min in early November and −14.2 min in mid February", () => {
    // Extremes of the equation of time (Meeus, Astronomical Algorithms, ch. 28;
    // values ≈ +16.4 min near Nov 3 and ≈ −14.2 min near Feb 11).
    const nov = sunPosition(new Date(Date.UTC(2025, 10, 3, 12)), 0, 0).equationOfTimeMin;
    const feb = sunPosition(new Date(Date.UTC(2025, 1, 11, 12)), 0, 0).equationOfTimeMin;
    expect(Math.abs(nov - 16.4)).toBeLessThan(0.2);
    expect(Math.abs(feb + 14.2)).toBeLessThan(0.2);
  });

  it("puts the sun due south / north at solar noon and gives the expected noon elevation", () => {
    // Kingston, Jamaica (18.0° N, 76.8° W). At the June solstice the noon sun is
    // north of the zenith (declination 23.44° > latitude), elevation ≈ 90 − (23.44 − 18.0).
    const lat = 18.0;
    const lon = -76.8;
    // Solar noon UTC = 12:00 − 4·lon − EoT [min]; EoT depends on the instant, so iterate.
    const day = Date.UTC(2024, 5, 20);
    let noonMin = 720 - 4 * lon;
    for (let i = 0; i < 3; i++) {
      const eot = sunPosition(new Date(day + noonMin * 60_000), lat, lon).equationOfTimeMin;
      noonMin = 720 - 4 * lon - eot;
    }
    const p = sunPosition(new Date(day + noonMin * 60_000), lat, lon);
    expect(Math.abs(p.hourAngleDeg)).toBeLessThan(0.01);
    expect(Math.abs(p.elevationDeg - (90 - (p.declinationDeg - lat)))).toBeLessThan(0.01);
    expect(p.azimuthDeg < 1 || p.azimuthDeg > 359).toBe(true); // due north
  });

  it("is below the horizon at local midnight and rises in the east", () => {
    const midnight = sunPosition(new Date(Date.UTC(2024, 2, 20, 5, 0)), 18, -76.8); // 00:00 local
    expect(midnight.elevationDeg).toBeLessThan(-40);
    const morning = sunPosition(new Date(Date.UTC(2024, 2, 20, 13, 0)), 18, -76.8); // ~08:00 local
    expect(morning.azimuthDeg).toBeGreaterThan(60);
    expect(morning.azimuthDeg).toBeLessThan(120);
  });

  it("handles the sun overhead and polar observers without NaN", () => {
    const p = sunPosition(new Date(Date.UTC(2024, 5, 20, 12)), 90, 0);
    expect(Number.isFinite(p.azimuthDeg)).toBe(true);
    expect(Math.abs(p.elevationDeg - p.declinationDeg)).toBeLessThan(0.01);
  });

  it("rejects invalid latitude", () => {
    expect(() => sunPosition(new Date(), 91, 0)).toThrow(RangeError);
  });
});

describe("refractionDeg", () => {
  it("follows the NOAA fit: 1735″ at the horizon, 0 near the zenith, decreasing with elevation", () => {
    expect(refractionDeg(0)).toBeCloseTo(1735 / 3600, 6);
    expect(refractionDeg(89)).toBe(0);
    expect(refractionDeg(10)).toBeGreaterThan(refractionDeg(30));
    expect(refractionDeg(-5)).toBeLessThan(0.1);
  });
});
