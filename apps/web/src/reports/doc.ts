import type { Drawing } from "./drawing";

/**
 * REPORT DOCUMENT — what every report is built as before it is rendered.
 * Builders (bom, calc sheet, checklist, SLD) are pure functions that return a
 * ReportDoc; renderers turn it into PDF (pdf.ts), XLSX (xlsx.ts) or CSV
 * (csv.ts). Cells hold display strings, or numbers that spreadsheets should
 * keep as numbers.
 */
export type Cell = string | number | null;

export interface Column {
  label: string;
  align?: "left" | "right" | "center";
  /** Relative width (PDF) / characters (XLSX). */
  width?: number;
}

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; muted?: boolean }
  | { kind: "fields"; fields: [string, string][] }
  | {
      kind: "table";
      /** Sheet name when exported to a workbook. */
      sheet?: string;
      columns: Column[];
      rows: Cell[][];
      /** Row indices drawn as section sub-headings (first cell spans the row). */
      groupRows?: number[];
      note?: string;
    }
  | { kind: "diagram"; drawing: Drawing; caption?: string }
  | {
      kind: "checklist";
      items: { text: string; expected?: string; ref?: string }[];
    };

/** Client / job details shown in every report's title block. */
export interface ReportHeader {
  projectName: string;
  clientName: string;
  siteAddress: string;
  site: string;
  preparedBy: string;
  reference: string;
  revision: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
}

export interface ReportDoc {
  /** Short title on the page header, e.g. "Bill of materials". */
  title: string;
  /** File name stem without extension. */
  fileStem: string;
  orientation: "portrait" | "landscape";
  /** A3 for drawings; reports default to Letter (US) paper. */
  paper?: "letter" | "a3";
  header: ReportHeader;
  blocks: Block[];
}

/** Safe file-name stem from a project name and report kind. */
export function fileStem(projectName: string, kind: string): string {
  const base = projectName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
  return `${base || "project"}-${kind}`;
}
