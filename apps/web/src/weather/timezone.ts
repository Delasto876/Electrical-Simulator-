/**
 * Local time in an IANA zone via Intl (DST handled by the browser's tz data).
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localParts(ms: number, tz: string): LocalParts {
  const parts = Object.fromEntries(
    fmt(tz)
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Offset of local time from UTC at `ms` [minutes] (e.g. −300 for Jamaica). */
export function utcOffsetMin(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** UTC instant of local midnight starting `date` (YYYY-MM-DD) in `tz`. */
export function localMidnightUtc(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let ms = guess - utcOffsetMin(guess, tz) * 60_000;
  ms = guess - utcOffsetMin(ms, tz) * 60_000; // second pass settles DST edges
  return ms;
}

export const isoDate = (p: Pick<LocalParts, "year" | "month" | "day">) =>
  `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
