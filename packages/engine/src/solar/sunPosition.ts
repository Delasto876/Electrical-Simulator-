import { degToRad as rad, radToDeg as deg } from "../units";

/**
 * Sun position from the NOAA Solar Calculator algorithm (NOAA Global
 * Monitoring Laboratory, "General Solar Position Calculations" / the NOAA
 * solar calculation spreadsheet, based on Meeus, "Astronomical Algorithms",
 * 2nd ed., 1998). Stated accuracy about ±0.01° for years 1800–2100
 * (refraction model aside).
 *
 * Inputs are UTC instants; universal time is used as terrestrial time
 * (ΔT ≈ 70 s is ignored — about 0.0003° of solar motion).
 *
 * Conventions:
 *   - latitude  [°], north positive
 *   - longitude [°], east positive
 *   - azimuth   [°], measured clockwise from true north (0 = N, 90 = E, 180 = S)
 *   - elevation [°] above the horizon; `apparentElevationDeg` includes
 *     atmospheric refraction, `elevationDeg` is geometric
 *   - equation of time [min]: apparent solar time − mean solar time
 */
export interface SunPosition {
  /** Solar declination [°]. */
  declinationDeg: number;
  /** Equation of time [min]. */
  equationOfTimeMin: number;
  /** Hour angle [°], negative before solar noon. */
  hourAngleDeg: number;
  /** Geometric elevation (no refraction) [°]. */
  elevationDeg: number;
  /** Elevation corrected for standard-atmosphere refraction [°]. */
  apparentElevationDeg: number;
  /** Apparent zenith angle = 90° − apparent elevation [°]. */
  zenithDeg: number;
  /** Azimuth, clockwise from north [°]. */
  azimuthDeg: number;
}

/** Julian Day of a JS Date (UTC). Unix epoch is JD 2440587.5. */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/** Declination [°] and equation of time [min] for a Julian century since J2000.0. */
function solarGeometry(jc: number) {
  const L0 = mod(280.46646 + jc * (36000.76983 + jc * 0.0003032), 360); // geometric mean longitude [°]
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc); // mean anomaly [°]
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc); // orbital eccentricity [-]
  const C =
    Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc) +
    Math.sin(rad(3 * M)) * 0.000289; // equation of centre [°]
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega)); // apparent longitude [°]
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega)); // corrected obliquity [°]
  const declinationDeg = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eotRad =
    y * Math.sin(2 * rad(L0)) -
    2 * e * Math.sin(rad(M)) +
    4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
    0.5 * y * y * Math.sin(4 * rad(L0)) -
    1.25 * e * e * Math.sin(2 * rad(M));
  return { declinationDeg, equationOfTimeMin: 4 * deg(eotRad) };
}

/**
 * Atmospheric refraction [°] for a geometric elevation [°], NOAA piecewise
 * approximation for a standard atmosphere (1010 mbar, 10 °C).
 */
export function refractionDeg(elevationDeg: number): number {
  const e = elevationDeg;
  const t = Math.tan(rad(e));
  let arcsec: number;
  if (e > 85) arcsec = 0;
  else if (e > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (e > -0.575) arcsec = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  else arcsec = -20.772 / t;
  return arcsec / 3600;
}

export function sunPosition(date: Date, latitudeDeg: number, longitudeDeg: number): SunPosition {
  if (latitudeDeg < -90 || latitudeDeg > 90) throw new RangeError("latitude must be within ±90°");
  const jd = julianDay(date);
  const jc = (jd - 2451545) / 36525;
  const { declinationDeg, equationOfTimeMin } = solarGeometry(jc);

  const minutesUtc = mod(date.getTime() / 60_000, 1440);
  const trueSolarTimeMin = mod(minutesUtc + equationOfTimeMin + 4 * longitudeDeg, 1440);
  let hourAngleDeg = trueSolarTimeMin / 4 - 180;
  if (hourAngleDeg < -180) hourAngleDeg += 360;

  const lat = rad(latitudeDeg);
  const dec = rad(declinationDeg);
  const cosZen = clamp(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(rad(hourAngleDeg)),
    -1,
    1,
  );
  const zenGeo = Math.acos(cosZen);
  const elevationDeg = 90 - deg(zenGeo);
  const apparentElevationDeg = elevationDeg + refractionDeg(elevationDeg);

  // Azimuth (NOAA form), clockwise from north.
  let azimuthDeg: number;
  const denom = Math.cos(lat) * Math.sin(zenGeo);
  if (Math.abs(denom) < 1e-12) {
    azimuthDeg = latitudeDeg > 0 ? 180 : 0; // sun at zenith or observer at a pole
  } else {
    const acosArg = clamp((Math.sin(lat) * Math.cos(zenGeo) - Math.sin(dec)) / denom, -1, 1);
    const a = deg(Math.acos(acosArg));
    azimuthDeg = hourAngleDeg > 0 ? mod(a + 180, 360) : mod(540 - a, 360);
  }

  return {
    declinationDeg,
    equationOfTimeMin,
    hourAngleDeg,
    elevationDeg,
    apparentElevationDeg,
    zenithDeg: 90 - apparentElevationDeg,
    azimuthDeg,
  };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
