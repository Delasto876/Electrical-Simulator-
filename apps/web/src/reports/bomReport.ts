import { PART_CATEGORIES, type Part } from "@solar-sim/catalog";
import type { BomLine } from "@solar-sim/engine";
import { CATEGORY_LABELS, catalogById, partLabel } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import type { Cell, Column, ReportDoc, ReportHeader } from "./doc";
import { fileStem } from "./doc";

/**
 * BILL OF MATERIALS (quantities only — no prices, by request). Lines from the
 * scene BOM grouped by catalog category in catalog order, numbered 1…n.
 * The same rows feed the on-screen table, CSV, XLSX and PDF.
 */
export interface BomRow {
  item: number;
  section: string;
  description: string;
  brand: string;
  model: string;
  catalogId: string;
  /** Engine variant key (e.g. rail stock length) — distinguishes lines of one item. */
  variant: string;
  detail: string;
  qty: number;
  unit: string;
  verified: boolean;
}

/** Section heading for a category (palette hints in brackets dropped). */
export function sectionLabel(cat: Part["category"] | undefined): string {
  if (!cat) return "Other";
  return (CATEGORY_LABELS[cat] ?? cat).replace(/\s*\(.*\)\s*$/, "");
}

const UNIT_LABEL: Record<BomLine["unit"], string> = {
  each: "ea",
  piece: "pc",
  set: "set",
  m: "m",
  ft: "ft",
};

export function bomRows(
  bom: readonly BomLine[],
  lookup: (id: string) => Part | undefined = (id) => catalogById.get(id),
): BomRow[] {
  const order = (c: Part["category"] | undefined) =>
    c ? PART_CATEGORIES.indexOf(c) : PART_CATEGORIES.length;
  const lines = bom
    .map((line, i) => ({ line, part: lookup(line.catalogId), i }))
    .sort(
      (a, b) =>
        order(a.part?.category) - order(b.part?.category) ||
        (a.part ? partLabel(a.part) : a.line.catalogId).localeCompare(
          b.part ? partLabel(b.part) : b.line.catalogId,
        ) ||
        a.i - b.i,
    );
  return lines.map(({ line, part }, k) => ({
    item: k + 1,
    section: sectionLabel(part?.category),
    description: part ? partLabel(part) : line.catalogId,
    brand: part?.brand ?? "",
    model: part?.model ?? "",
    catalogId: line.catalogId,
    variant: line.variant ?? "",
    detail: [line.variant ? `${line.variant}` : "", line.detail ?? ""].filter(Boolean).join(" · "),
    qty: Math.round(line.qty * 100) / 100,
    unit: UNIT_LABEL[line.unit],
    verified: part?.verified ?? false,
  }));
}

export const BOM_COLUMNS: Column[] = [
  { label: "#", align: "right", width: 5 },
  { label: "Description", width: 38 },
  { label: "Detail / cut", width: 34 },
  { label: "Catalog id", width: 30 },
  { label: "Qty", align: "right", width: 8 },
  { label: "Unit", width: 6 },
  { label: "Data", width: 11 },
];

/** Flat rows for CSV (section as its own column instead of group rows). */
export function bomCsvTable(rows: readonly BomRow[]): { header: string[]; rows: Cell[][] } {
  return {
    header: [
      "Item",
      "Section",
      "Description",
      "Brand",
      "Model",
      "Detail / cut",
      "Catalog id",
      "Qty",
      "Unit",
      "Data",
    ],
    rows: rows.map((r) => [
      r.item,
      r.section,
      r.description,
      r.brand,
      r.model,
      r.detail,
      r.catalogId,
      r.qty,
      r.unit,
      r.verified ? "verified" : "unverified",
    ]),
  };
}

/** Table rows with a group row before each section. */
export function bomTable(rows: readonly BomRow[]): { rows: Cell[][]; groupRows: number[] } {
  const out: Cell[][] = [];
  const groupRows: number[] = [];
  let section: string | undefined;
  for (const r of rows) {
    if (r.section !== section) {
      section = r.section;
      groupRows.push(out.length);
      out.push([section]);
    }
    out.push([
      r.item,
      r.description,
      r.detail || "—",
      r.catalogId,
      r.qty,
      r.unit,
      r.verified ? "verified" : "unverified",
    ]);
  }
  return { rows: out, groupRows };
}

export function bomReport(
  p: ProjectFile,
  bom: readonly BomLine[],
  header: ReportHeader,
): ReportDoc {
  const rows = bomRows(bom);
  const t = bomTable(rows);
  const unverified = rows.filter((r) => !r.verified).length;
  return {
    title: "Bill of materials",
    fileStem: fileStem(p.meta.name, "bom"),
    orientation: "landscape",
    header,
    blocks: [
      {
        kind: "fields",
        fields: [
          ["Line items", String(rows.length)],
          ["Sections", String(t.groupRows.length)],
          [
            "Unverified catalog data",
            unverified ? `${unverified} line(s): check datasheets` : "none",
          ],
        ],
      },
      {
        kind: "table",
        sheet: "BOM",
        columns: BOM_COLUMNS,
        rows: t.rows,
        groupRows: t.groupRows,
        note:
          "Quantities from the 3D design: cable lengths are routed length plus slack, rounded up to 0.5 m per run; " +
          "conduit and trunking in stock lengths after the cut list. Prices are not included.",
      },
    ],
  };
}
