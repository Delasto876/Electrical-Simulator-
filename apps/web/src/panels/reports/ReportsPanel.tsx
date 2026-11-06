import { useMemo, useState } from "react";
import { COMPANY } from "../../config/company";
import type { ReportInfo } from "../../project/projectFile";
import { exportPack, REPORT_FORMATS, type ReportKind } from "../../reports/exports";
import { buildSld } from "../../reports/sld";
import { sceneFor } from "../../scene/useSceneModel";
import { useSim } from "../../sim/simStore";
import { updateReportInfo } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { Field } from "../inspector/fields";
import { DrawingSvg } from "./DrawingSvg";
import { ExportButtons } from "./ExportButtons";

const REPORTS: { kind: ReportKind; title: string; about: string }[] = [
  {
    kind: "calculations",
    title: "Calculation sheet",
    about: "Strings vs MPPT, conductors, protection, grounding, raceways, energy and open issues.",
  },
  {
    kind: "sld",
    title: "Single-line diagram",
    about: "Generated from the wiring, with the circuit schedule (A3).",
  },
  {
    kind: "bom",
    title: "Bill of materials",
    about: "Quantities by category, no prices.",
  },
  {
    kind: "checklist",
    title: "Installation & commissioning checklist",
    about: "Every step and test for this design, with expected readings.",
  },
];

const INFO_FIELDS: { key: keyof ReportInfo; label: string; placeholder: string }[] = [
  { key: "clientName", label: "Client", placeholder: "Client name" },
  { key: "siteAddress", label: "Site address", placeholder: "Street, town, parish" },
  { key: "reference", label: "Job / quote ref.", placeholder: "e.g. LT-2026-014" },
  { key: "revision", label: "Revision", placeholder: "A" },
  { key: "preparedBy", label: "Prepared by", placeholder: "Your name" },
];

/** Reports tab: job details for the title block, exports, and the live single-line diagram. */
export function ReportsPanel() {
  const project = useProject((s) => s.project);
  const revision = useProject((s) => s.revision);
  const simRevision = useSim((s) => s.revision);
  const hasSim = useSim((s) => s.output !== null);
  const sld = useMemo(() => buildSld(project, sceneFor(project, [])), [project]);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pack = async () => {
    setBusy(true);
    setPackMsg(null);
    try {
      setPackMsg(`Saved ${await exportPack()}`);
    } catch (e) {
      setPackMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reports-panel" data-testid="reports-panel">
      <div className="reports-side">
        <div className="company-card">
          <img src={COMPANY.logoUrl} alt={`${COMPANY.name} logo`} />
          <div>
            <strong>{COMPANY.name}</strong>
            <div className="muted">{COMPANY.website}</div>
            <div className="muted">{COMPANY.phone}</div>
          </div>
        </div>
        <h3 className="section-title">Job details (printed on every report)</h3>
        {INFO_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              type="text"
              value={project.report[f.key]}
              placeholder={f.placeholder}
              data-testid={`report-${f.key}`}
              onChange={(e) => updateReportInfo({ [f.key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="reports-main">
        <ul className="report-list">
          {REPORTS.map((r) => (
            <li key={r.kind}>
              <div>
                <strong>{r.title}</strong>
                <div className="muted">{r.about}</div>
              </div>
              <ExportButtons kind={r.kind} formats={REPORT_FORMATS[r.kind]} />
            </li>
          ))}
          <li className="report-pack">
            <div>
              <strong>Full design report</strong>
              <div className="muted">All four in one PDF.</div>
            </div>
            <span className="export-buttons">
              <button
                type="button"
                className="primary"
                disabled={busy}
                data-testid="export-pack"
                onClick={() => void pack()}
              >
                {busy ? "…" : "PDF"}
              </button>
              {packMsg && (
                <span className="muted export-msg" role="status">
                  {packMsg}
                </span>
              )}
            </span>
          </li>
        </ul>
        <p className="hint">
          {hasSim && simRevision === revision
            ? "The calculation sheet includes the energy simulation results."
            : "Run the simulation (Simulation tab) to add energy results to the calculation sheet."}
        </p>
        <h3 className="section-title">Single-line diagram</h3>
        {sld.nodes.length > 0 ? (
          <div className="sld-preview" data-testid="sld-preview">
            <DrawingSvg drawing={sld.drawing} label="Single-line diagram" />
          </div>
        ) : (
          <p className="empty">Wire strings to an inverter to see the single-line diagram.</p>
        )}
      </div>
    </div>
  );
}
