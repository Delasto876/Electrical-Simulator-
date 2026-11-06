import { COMPANY } from "../config/company";
import { sceneFor } from "../scene/useSceneModel";
import { useProject } from "../state/projectStore";
import { useSim } from "../sim/simStore";
import { bomCsvTable, bomReport, bomRows } from "./bomReport";
import { calcSheet, type SimSummary } from "./calcSheet";
import { checklist } from "./checklist";
import { toCsv } from "./csv";
import type { ReportDoc } from "./doc";
import { reportHeader } from "./header";
import { sldReport } from "./sldReport";

/**
 * EXPORTS — the only file that touches the browser for reports: builds the
 * documents from the current project (normal operation: no ATS what-if
 * outages), renders them, and saves the file. jsPDF and the XLSX writer are
 * loaded on first use so they do not slow down app start.
 */
export type ReportKind = "bom" | "calculations" | "sld" | "checklist";
export type ReportFormat = "pdf" | "xlsx" | "csv";

export const REPORT_FORMATS: Record<ReportKind, ReportFormat[]> = {
  bom: ["csv", "xlsx", "pdf"],
  calculations: ["pdf", "xlsx"],
  sld: ["pdf"],
  checklist: ["pdf"],
};

const MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
};

/** Simulation results if they belong to the current project revision. */
export function currentSim(): SimSummary | undefined {
  const sim = useSim.getState();
  const { project, revision } = useProject.getState();
  if (!sim.output || sim.revision !== revision) return undefined;
  const s = project.simulation;
  return {
    output: sim.output,
    weatherLabel: sim.weatherLabel,
    period: `${s.period} from ${s.date}, ${s.stepMin}-minute steps`,
  };
}

export function buildReport(kind: ReportKind, now = new Date()): ReportDoc {
  const p = useProject.getState().project;
  const scene = sceneFor(p, []);
  const header = reportHeader(p, now);
  switch (kind) {
    case "bom":
      return bomReport(p, scene.bom, header);
    case "calculations":
      return calcSheet(p, scene, header, currentSim());
    case "sld":
      return sldReport(p, scene, header);
    case "checklist":
      return checklist(p, scene, header);
  }
}

let logo: Promise<{ png: Uint8Array; aspect: number } | undefined> | undefined;
/** The company logo as PNG bytes (fetched once). */
export function loadLogo() {
  logo ??= fetch(COMPANY.logoUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => {
      const png = new Uint8Array(b);
      const v = new DataView(b);
      // PNG IHDR: width at byte 16, height at byte 20 (big-endian).
      const aspect = png.length > 24 ? v.getUint32(16) / v.getUint32(20) : 0.8;
      return { png, aspect };
    })
    .catch(() => undefined);
  return logo;
}

/** Render reports to bytes (PDF/XLSX) or text (CSV). Exposed for tests. */
export async function renderReports(
  docs: ReportDoc[],
  format: ReportFormat,
): Promise<{ data: Uint8Array | string; name: string; mime: string }> {
  const first = docs[0]!;
  const name =
    docs.length > 1 ? first.fileStem.replace(/-[^-]+$/, "-design-report") : first.fileStem;
  if (format === "csv") {
    const t = bomCsvTable(bomRows(sceneFor(useProject.getState().project, []).bom));
    return { data: toCsv(t.header, t.rows), name: `${name}.csv`, mime: MIME.csv };
  }
  const l = await loadLogo();
  if (format === "xlsx") {
    const [{ buildXlsx }, { docSheets }] = await Promise.all([
      import("./xlsx"),
      import("./sheets"),
    ]);
    const data = buildXlsx(
      docSheets(docs),
      l ? { png: l.png, widthPx: Math.round(110 * l.aspect), heightPx: 110 } : undefined,
    );
    return { data, name: `${name}.xlsx`, mime: MIME.xlsx };
  }
  const { renderPdf } = await import("./pdf");
  const data = renderPdf(docs, l ? { logoPng: l.png, logoAspect: l.aspect } : {});
  return { data, name: `${name}.pdf`, mime: MIME.pdf };
}

/** Build, render and save one report. */
export async function exportReport(kind: ReportKind, format: ReportFormat): Promise<string> {
  const out = await renderReports([buildReport(kind)], format);
  await saveFile(out.data, out.name, out.mime);
  return out.name;
}

/** All four reports in one PDF. */
export async function exportPack(): Promise<string> {
  const docs = (["calculations", "sld", "bom", "checklist"] as const).map((k) => buildReport(k));
  const out = await renderReports(docs, "pdf");
  await saveFile(out.data, out.name, out.mime);
  return out.name;
}

/** The claude.ai page host (present only when the app runs as a published artifact). */
interface DownloadsHost {
  save: (r: { filename: string; data: Blob }) => Promise<unknown>;
}
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

/**
 * Save a generated file. A published claude.ai page cannot start downloads
 * itself; there the host's `downloads` capability asks the viewer to confirm
 * the save. Everywhere else a temporary link is clicked.
 */
export async function saveFile(data: Uint8Array | string, name: string, mime: string) {
  const blob = new Blob([typeof data === "string" ? data : (data.slice().buffer as ArrayBuffer)], {
    type: mime,
  });
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  if (typeof host?.use === "function") {
    const dl = (await host.use("downloads")) as DownloadsHost | null;
    if (dl) {
      try {
        await dl.save({ filename: name, data: blob });
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        throw new Error(code === "declined" ? "save cancelled" : (code ?? String(e)), { cause: e });
      }
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
