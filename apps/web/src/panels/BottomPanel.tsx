import { useUi, type BottomTab } from "../state/uiStore";
import { IvCurvePanel } from "./charts/IvCurvePanel";
import { ConductorCalculator } from "./calcs/ConductorCalculator";

const TABS: { id: BottomTab; label: string; phase: number }[] = [
  { id: "issues", label: "Issues", phase: 3 },
  { id: "calculations", label: "Calculations", phase: 1 },
  { id: "charts", label: "Charts", phase: 1 },
  { id: "bom", label: "BOM", phase: 2 },
  { id: "timeline", label: "Timeline", phase: 6 },
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
        {active.id === "charts" ? (
          <IvCurvePanel />
        ) : active.id === "calculations" ? (
          <ConductorCalculator />
        ) : (
          <p className="empty">
            {active.label}: not available yet (arrives in Phase {active.phase}).
          </p>
        )}
      </div>
    </div>
  );
}
