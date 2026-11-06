import { jsPDF } from "jspdf";
import { autoTable, type RowInput } from "jspdf-autotable";
import { COMPANY, REPORT_DISCLAIMER } from "../config/company";
import type { Block, ReportDoc } from "./doc";
import type { Drawing, Rgb } from "./drawing";

/**
 * PDF RENDERER — any ReportDoc (or several, as one pack) to a PDF with the
 * company title block on every page. Standard PDF fonts only cover
 * Windows-1252, so text passes through pdfText() first (Ω → ohm, ≤ → <=, …).
 * Units: millimetres; font sizes in points.
 */
export interface PdfAssets {
  logoPng?: Uint8Array;
  /** Logo aspect ratio (width / height). */
  logoAspect?: number;
}

const MAP: [RegExp, string][] = [
  [/ ?Ω/g, " ohm"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/−/g, "-"],
  [/[‐‑‒]/g, "-"],
  [/√/g, "sqrt"],
  [/Δ/g, "d"],
  [/β/g, "beta"],
  [/η/g, "eff"],
  [/≈/g, "~"],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/″/g, '"'],
  [/′/g, "'"],
  [/½/g, "1/2"],
  [/¼/g, "1/4"],
  [/¾/g, "3/4"],
  [/⅜/g, "3/8"],
  [/☐/g, "[ ]"],
  [/\u00A0/g, " "],
];

/** Text safe for the built-in PDF fonts (Windows-1252). */
export function pdfText(s: string): string {
  let t = s;
  for (const [re, rep] of MAP) t = t.replace(re, rep);
  // Anything else outside Windows-1252 printable range → "?"
  return t.replace(
    /[^\n\r\t\u0020-\u007E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g,
    "?",
  );
}

const PAGE = {
  letter: { w: 215.9, h: 279.4 },
  a3: { w: 420, h: 297 },
};
const M = 12; // side margin
const HEAD_H = 30;
const FOOT_H = 14;
const ACCENT = COMPANY.accentRgb;

const rgb = (c: Rgb | readonly number[]) =>
  [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0] as [number, number, number];

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? HEAD_H;
}

export function renderPdf(docs: readonly ReportDoc[], assets: PdfAssets = {}): Uint8Array {
  const first = docs[0];
  if (!first) throw new Error("nothing to render");
  const size = (d: ReportDoc) => PAGE[d.paper ?? "letter"];
  const fmt = (d: ReportDoc): [number, number] => [size(d).w, size(d).h];
  const doc = new jsPDF({ unit: "mm", format: fmt(first), orientation: first.orientation });
  doc.setProperties({
    title: pdfText(docs.length > 1 ? "Design report" : first.title),
    author: COMPANY.name,
    creator: `${COMPANY.name} solar design simulator`,
  });
  const pageDoc: ReportDoc[] = [];
  docs.forEach((d, i) => {
    if (i > 0) doc.addPage(fmt(d), d.orientation);
    const start = doc.getNumberOfPages();
    renderBlocks(doc, d);
    for (let k = start; k <= doc.getNumberOfPages(); k++) pageDoc[k] = d;
  });
  const total = doc.getNumberOfPages();
  for (let k = 1; k <= total; k++) {
    doc.setPage(k);
    drawHeader(doc, pageDoc[k] ?? first, assets);
    drawFooter(doc, k, total);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

function pageW(doc: jsPDF) {
  return doc.internal.pageSize.getWidth();
}
function pageH(doc: jsPDF) {
  return doc.internal.pageSize.getHeight();
}

function drawHeader(doc: jsPDF, d: ReportDoc, assets: PdfAssets) {
  const w = pageW(doc);
  const top = 8;
  let x = M;
  if (assets.logoPng) {
    const h = 18;
    const lw = h * (assets.logoAspect ?? 0.8);
    doc.addImage(assets.logoPng, "PNG", M, top - 1.5, lw, h, "company-logo", "FAST");
    x = M + lw + 4;
  }
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(pdfText(COMPANY.name), x, top + 5);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(pdfText(COMPANY.tagline), x, top + 9.5);
  doc.text(pdfText(`${COMPANY.website} · ${COMPANY.phone} · ${COMPANY.email}`), x, top + 13.5);
  doc.text(pdfText(COMPANY.address), x, top + 17.5);

  const h = d.header;
  const rx = w - M;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(pdfText(d.title), rx, top + 5, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  const lines = [
    h.projectName,
    [h.clientName && `Client: ${h.clientName}`, h.siteAddress || h.site]
      .filter(Boolean)
      .join(" · "),
    [
      h.reference && `Ref ${h.reference}`,
      `Rev ${h.revision || "-"}`,
      h.date,
      h.preparedBy && `By ${h.preparedBy}`,
    ]
      .filter(Boolean)
      .join(" · "),
  ];
  lines.forEach((l, i) => doc.text(pdfText(l), rx, top + 9.5 + i * 4, { align: "right" }));
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(M, HEAD_H - 4, w - M, HEAD_H - 4);
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  const w = pageW(doc);
  const h = pageH(doc);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(M, h - FOOT_H + 1, w - M, h - FOOT_H + 1);
  doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(110, 110, 110);
  const wrapped = doc.splitTextToSize(pdfText(REPORT_DISCLAIMER), w - 2 * M - 30) as string[];
  doc.text(wrapped, M, h - FOOT_H + 4.5);
  doc.text(`Page ${page} of ${total}`, w - M, h - FOOT_H + 4.5, { align: "right" });
}

function renderBlocks(doc: jsPDF, d: ReportDoc) {
  let y = HEAD_H;
  const bottom = () => pageH(doc) - FOOT_H - 2;
  /** y after starting a new page when `need` mm do not fit below `at`. */
  const ensure: Ensure = (at, need) => {
    if (at + need <= bottom()) return at;
    doc.addPage(undefined, d.orientation);
    return HEAD_H;
  };
  const tableBase = {
    margin: { left: M, right: M, top: HEAD_H, bottom: FOOT_H + 2 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.2, overflow: "linebreak" as const },
    rowPageBreak: "avoid" as const,
    headStyles: {
      fillColor: [227, 239, 211] as [number, number, number],
      textColor: 20,
      fontStyle: "bold" as const,
    },
  };
  for (const b of d.blocks) y = renderBlock(doc, b, y, ensure, tableBase, bottom);
}

type Ensure = (at: number, need: number) => number;

function renderBlock(
  doc: jsPDF,
  b: Block,
  y0: number,
  ensure: Ensure,
  base: Record<string, unknown>,
  bottom: () => number,
): number {
  let y = y0;
  const w = pageW(doc) - 2 * M;
  switch (b.kind) {
    case "heading": {
      y = ensure(y, 20); // keep the heading with a few lines of what follows
      doc
        .setFont("helvetica", "bold")
        .setFontSize(10.5)
        .setTextColor(...ACCENT);
      doc.text(pdfText(b.text), M, y + 5);
      return y + 8;
    }
    case "paragraph": {
      doc.setFont("helvetica", "normal").setFontSize(8);
      if (b.muted) doc.setTextColor(110, 110, 110);
      else doc.setTextColor(20, 20, 20);
      const lines = doc.splitTextToSize(pdfText(b.text), w) as string[];
      y = ensure(y, lines.length * 3.6 + 2);
      doc.text(lines, M, y + 3.5);
      return y + lines.length * 3.6 + 3;
    }
    case "fields": {
      autoTable(doc, {
        ...base,
        startY: y,
        theme: "plain",
        body: b.fields.map(([k, v]) => [pdfText(k), pdfText(v)]),
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 62 } },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 0.9 },
      });
      return finalY(doc) + 3;
    }
    case "table": {
      const groups = new Set(b.groupRows ?? []);
      const body: RowInput[] = b.rows.map((r, i) =>
        groups.has(i)
          ? [
              {
                content: pdfText(String(r[0] ?? "")),
                colSpan: b.columns.length,
                styles: { fontStyle: "bold", fillColor: [240, 240, 240], halign: "left" },
              },
            ]
          : r.map((c) => (c === null ? "" : pdfText(String(c)))),
      );
      const totalW = b.columns.reduce((t, c) => t + (c.width ?? 10), 0);
      autoTable(doc, {
        ...base,
        startY: y,
        theme: "grid",
        head: [b.columns.map((c) => pdfText(c.label))],
        body,
        columnStyles: Object.fromEntries(
          b.columns.map((c, i) => [
            i,
            { halign: c.align ?? "left", cellWidth: ((c.width ?? 10) / totalW) * w },
          ]),
        ),
      });
      y = finalY(doc) + 2;
      if (b.note) {
        doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(110, 110, 110);
        const lines = doc.splitTextToSize(pdfText(b.note), w) as string[];
        y = ensure(y, lines.length * 3.2 + 2);
        doc.text(lines, M, y + 2.5);
        y += lines.length * 3.2 + 2;
      }
      return y + 2;
    }
    case "checklist": {
      autoTable(doc, {
        ...base,
        startY: y,
        theme: "grid",
        head: [["", "Item", "Expected", "Ref", "Measured / initials"]],
        body: b.items.map((it) => [
          "",
          pdfText(it.text),
          pdfText(it.expected ?? ""),
          pdfText(it.ref ?? ""),
          "",
        ]),
        columnStyles: {
          0: { cellWidth: 7 },
          1: { cellWidth: w * 0.46 },
          2: { cellWidth: w * 0.24 },
          3: { cellWidth: w * 0.1 },
        },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 0) {
            doc.setDrawColor(60, 60, 60).setLineWidth(0.3);
            doc.rect(data.cell.x + 1.8, data.cell.y + 1.4, 3.2, 3.2);
          }
        },
      });
      return finalY(doc) + 4;
    }
    case "diagram": {
      y = ensure(y, 60 + (b.caption ? 6 : 0));
      const avail = bottom() - y - (b.caption ? 6 : 0);
      const scale = Math.min(w / b.drawing.width, avail / b.drawing.height, 1.6);
      const ox = M + (w - b.drawing.width * scale) / 2;
      drawDrawing(doc, b.drawing, ox, y, scale);
      y += b.drawing.height * scale + 2;
      if (b.caption) {
        doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(110, 110, 110);
        doc.text(pdfText(b.caption), M, y + 3);
        y += 6;
      }
      return y;
    }
  }
}

/** Draw a Drawing at (ox, oy) [mm] with a scale factor. */
export function drawDrawing(doc: jsPDF, dr: Drawing, ox: number, oy: number, k: number) {
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;
  const stroke = (c: Rgb | undefined, wmm: number | undefined, dash: boolean | undefined) => {
    doc.setDrawColor(...rgb(c ?? [20, 20, 20]));
    doc.setLineWidth((wmm ?? 0.3) * k);
    doc.setLineDashPattern(dash ? [1.2 * k, 0.9 * k] : [], 0);
  };
  for (const s of dr.shapes) {
    switch (s.kind) {
      case "line":
        stroke(s.stroke, s.width, s.dash);
        doc.line(X(s.x1), Y(s.y1), X(s.x2), Y(s.y2));
        break;
      case "polyline":
        stroke(s.stroke, s.width, s.dash);
        for (let i = 1; i < s.points.length; i++) {
          const a = s.points[i - 1]!;
          const b = s.points[i]!;
          doc.line(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]));
        }
        break;
      case "rect": {
        stroke(s.stroke, s.width, s.dash);
        const style = s.fill ? (s.stroke ? "FD" : "F") : "S";
        if (s.fill) doc.setFillColor(...rgb(s.fill));
        if (s.r) doc.roundedRect(X(s.x), Y(s.y), s.w * k, s.h * k, s.r * k, s.r * k, style);
        else doc.rect(X(s.x), Y(s.y), s.w * k, s.h * k, style);
        break;
      }
      case "circle": {
        stroke(s.stroke, s.width, s.dash);
        if (s.fill) doc.setFillColor(...rgb(s.fill));
        doc.circle(X(s.cx), Y(s.cy), s.r * k, s.fill ? (s.stroke ? "FD" : "F") : "S");
        break;
      }
      case "text":
        doc.setFont("helvetica", s.bold ? "bold" : "normal");
        doc.setFontSize(s.size * k);
        doc.setTextColor(...rgb(s.color ?? [20, 20, 20]));
        doc.text(pdfText(s.text), X(s.x), Y(s.y), {
          align: s.anchor === "middle" ? "center" : s.anchor === "end" ? "right" : "left",
        });
        break;
    }
  }
  doc.setLineDashPattern([], 0);
}
