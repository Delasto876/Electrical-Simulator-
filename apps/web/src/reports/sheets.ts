import { COMPANY } from "../config/company";
import type { ReportDoc } from "./doc";
import type { XlsxSheet } from "./xlsx";

/** Every table in the given reports as a workbook sheet with the title block above it. */
export function docSheets(docs: readonly ReportDoc[]): XlsxSheet[] {
  const out: XlsxSheet[] = [];
  for (const d of docs) {
    const h = d.header;
    const titleRows: XlsxSheet["titleRows"] = [
      [COMPANY.name, "title"],
      [`${COMPANY.website} · ${COMPANY.phone} · ${COMPANY.email}`, "muted"],
      [`${d.title} — ${h.projectName}`, "bold"],
      [
        [
          h.clientName && `Client: ${h.clientName}`,
          h.siteAddress || h.site,
          h.reference && `Ref ${h.reference}`,
          `Rev ${h.revision || "-"}`,
          h.date,
          h.preparedBy && `Prepared by ${h.preparedBy}`,
        ]
          .filter(Boolean)
          .join(" · "),
        "normal",
      ],
    ];
    for (const b of d.blocks)
      if (b.kind === "table")
        out.push({
          name: b.sheet ?? d.title,
          titleRows,
          columns: b.columns,
          rows: b.rows,
          groupRows: b.groupRows,
          note: b.note,
        });
  }
  return out;
}
