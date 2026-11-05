import { ISSUE_CODES, type Issue } from "@solar-sim/engine";
import { useSceneModel } from "../../scene/useSceneModel";
import { useProject } from "../../state/projectStore";
import { useUi } from "../../state/uiStore";

const SEV_LABEL: Record<Issue["severity"], string> = {
  error: "✗ Error",
  warning: "⚠ Warning",
  info: "ℹ Info",
};

/** Issues tab: every design-rule finding, worst first. Clicking selects the offending array/part. */
export function IssuesList() {
  const { issues } = useSceneModel();
  const project = useProject((s) => s.project);
  const arrays = project.arrays;
  /** Select whatever the issue is about: string, cable, placed part or array. */
  const selectTarget = (id: string | undefined) => {
    if (!id) return;
    const ui = useUi.getState();
    if (project.strings.some((x) => x.id === id)) ui.select({ kind: "string", id });
    else if (project.cables.some((x) => x.id === id)) ui.select({ kind: "cable", id });
    else if (project.parts.some((x) => x.id === id)) ui.select({ kind: "part", id });
    else if (arrays.some((x) => x.id === id)) ui.select({ kind: "array", id });
  };
  const nameOf = (id: string | undefined) =>
    arrays.find((a) => a.id === id)?.name ??
    project.strings.find((x) => x.id === id)?.name ??
    project.cables.find((x) => x.id === id)?.name ??
    (id ? "equipment" : "");
  if (issues.length === 0) {
    return (
      <p className="empty" data-testid="issues-empty">
        ✓ No issues found by the mounting, placement, string, connector and cable rules. Protection
        and grounding rules arrive in Phase 4.
      </p>
    );
  }
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return (
    <div>
      <p className="hint" data-testid="issues-summary">
        {counts.error} error{counts.error === 1 ? "" : "s"}, {counts.warning} warning
        {counts.warning === 1 ? "" : "s"}, {counts.info} info
      </p>
      <ul className="issue-list">
        {issues.map((i, k) => {
          const target = i.partIds[0];
          const name = nameOf(target);
          return (
            <li key={k} className={`issue sev-${i.severity}`}>
              <button type="button" className="issue-btn" onClick={() => selectTarget(target)}>
                <span className="sev">{SEV_LABEL[i.severity]}</span>{" "}
                <strong title={ISSUE_CODES[i.code].explain}>{ISSUE_CODES[i.code].title}</strong>{" "}
                <span className="muted">
                  · {name} · {i.code}
                </span>
                <div>{i.message}</div>
                <div className="hint">Fix: {i.fixHint}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
