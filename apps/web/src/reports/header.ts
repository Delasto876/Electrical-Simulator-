import type { ProjectFile } from "../project/projectFile";
import type { ReportHeader } from "./doc";

/** Title-block details for a report printed now. */
export function reportHeader(p: ProjectFile, now: Date = new Date()): ReportHeader {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    projectName: p.meta.name,
    clientName: p.report.clientName,
    siteAddress: p.report.siteAddress,
    site: p.site.name,
    preparedBy: p.report.preparedBy,
    reference: p.report.reference,
    revision: p.report.revision,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}
