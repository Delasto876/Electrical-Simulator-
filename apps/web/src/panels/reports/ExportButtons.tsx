import { useState } from "react";
import { exportReport, type ReportFormat, type ReportKind } from "../../reports/exports";

const LABEL: Record<ReportFormat, string> = { csv: "CSV", xlsx: "Excel", pdf: "PDF" };

/** One button per available format; shows the saved file name or the error. */
export function ExportButtons({ kind, formats }: { kind: ReportKind; formats: ReportFormat[] }) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (f: ReportFormat) => {
    setBusy(f);
    setMsg(null);
    try {
      setMsg(`Saved ${await exportReport(kind, f)}`);
    } catch (e) {
      setMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <span className="export-buttons">
      {formats.map((f) => (
        <button
          key={f}
          type="button"
          disabled={busy !== null}
          data-testid={`export-${kind}-${f}`}
          onClick={() => void run(f)}
        >
          {busy === f ? "…" : LABEL[f]}
        </button>
      ))}
      {msg && (
        <span className="muted export-msg" role="status">
          {msg}
        </span>
      )}
    </span>
  );
}
