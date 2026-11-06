import { lazy, Suspense } from "react";
import { useUi, type BottomTab } from "../state/uiStore";

// Chart tabs load on first open (Recharts is the largest library in the app).
const IvCurvePanel = lazy(() =>
  import("./charts/IvCurvePanel").then((m) => ({ default: m.IvCurvePanel })),
);
const SimulationPanel = lazy(() =>
  import("./sim/SimulationPanel").then((m) => ({ default: m.SimulationPanel })),
);
import { ConductorCalculator } from "./calcs/ConductorCalculator";
import { BomTable } from "./results/BomTable";
import { CutList } from "./results/CutList";
import { IssuesList } from "./results/IssuesList";
import { ReportsPanel } from "./reports/ReportsPanel";

const TABS: { id: BottomTab; label: string; phase: number }[] = [
  { id: "issues", label: "Issues", phase: 2 },
  { id: "calculations", label: "Calculations", phase: 1 },
  { id: "charts", label: "Charts", phase: 1 },
  { id: "bom", label: "BOM", phase: 2 },
  { id: "cuts", label: "Cut list", phase: 5 },
  { id: "simulation", label: "Simulation", phase: 6 },
  { id: "reports", label: "Reports", phase: 7 },
];

export function BottomPanel() {
  const tab = useUi((s) => s.bottomTab);
  const setTab = useUi((s) => s.setBottomTab);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  return (
    <div className="bottom-panel">
      <div role="tablist" aria-label="Result tabs" className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls={`tabpanel-${t.id}`}
            className="tab"
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${active.id}`}
        aria-labelledby={`tab-${active.id}`}
        className="tabpanel"
      >
        <Suspense fallback={<p className="empty">Loading…</p>}>
          {active.id === "issues" ? (
            <IssuesList />
          ) : active.id === "bom" ? (
            <BomTable />
          ) : active.id === "cuts" ? (
            <CutList />
          ) : active.id === "simulation" ? (
            <SimulationPanel />
          ) : active.id === "reports" ? (
            <ReportsPanel />
          ) : active.id === "charts" ? (
            <IvCurvePanel />
          ) : active.id === "calculations" ? (
            <ConductorCalculator />
          ) : (
            <p className="empty">
              {active.label}: not available yet (arrives in Phase {active.phase}).
            </p>
          )}
        </Suspense>
      </div>
    </div>
  );
}
