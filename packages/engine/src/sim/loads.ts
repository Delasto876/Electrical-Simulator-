/**
 * LOAD PROFILES: average power of a load over a time step from its rating, a
 * duty cycle (fraction of time running) and the hours it is in use (local time).
 */
export type LoadProfile =
  | { kind: "always"; dutyPct: number }
  /** In use from startH to endH local time (wraps past midnight when endH < startH). */
  | { kind: "window"; startH: number; endH: number; dutyPct: number };

export function inWindow(hour: number, startH: number, endH: number): boolean {
  if (startH === endH) return false;
  return startH < endH ? hour >= startH && hour < endH : hour >= startH || hour < endH;
}

/** Average power [W] at local hour-of-day `hour` (0 ≤ hour < 24, fractional). */
export function loadPowerW(ratedW: number, profile: LoadProfile, hour: number): number {
  const duty = Math.min(100, Math.max(0, profile.dutyPct)) / 100;
  if (profile.kind === "always") return ratedW * duty;
  return inWindow(hour, profile.startH, profile.endH) ? ratedW * duty : 0;
}
