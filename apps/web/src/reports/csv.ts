import type { Cell } from "./doc";

/**
 * CSV (RFC 4180): comma separated, CRLF line ends, fields quoted when they
 * contain a comma, quote or line break. Starts with a UTF-8 byte-order mark so
 * Excel opens "×", "°" and "″" correctly. Text that a spreadsheet would run as
 * a formula (=, +, −, @ first) is prefixed with an apostrophe.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const line = (cells: readonly Cell[]) => cells.map(csvField).join(",");
  return `\uFEFF${[line(header), ...rows.map(line)].join("\r\n")}\r\n`;
}

export function csvField(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  const safe = /^[=+\-@\t\r]/.test(c) ? `'${c}` : c;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
