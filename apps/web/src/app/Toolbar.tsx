import { DEFAULT_CODE_PROFILE } from "@solar-sim/engine";
import { useUi } from "../state/uiStore";

/** Buttons for features that arrive in later phases are shown disabled with the phase in the tooltip. */
const PENDING: { label: string; phase: number }[] = [
  { label: "Undo", phase: 2 },
  { label: "Redo", phase: 2 },
  { label: "Tools", phase: 2 },
  { label: "View", phase: 2 },
  { label: "Simulate", phase: 6 },
];

export function Toolbar() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ☀
        </span>
        <span>Solar Design Simulator</span>
        <span className="project-name" title="Project">
          Untitled project
        </span>
      </div>
      <nav className="toolbar-actions" aria-label="Main actions">
        {PENDING.map((b) => (
          <button key={b.label} type="button" disabled title={`Available from Phase ${b.phase}`}>
            {b.label}
          </button>
        ))}
      </nav>
      <div className="toolbar-right">
        <span
          className="profile-chip"
          title={DEFAULT_CODE_PROFILE.caveat}
          data-testid="code-profile"
        >
          Code profile: <strong>{DEFAULT_CODE_PROFILE.id}</strong>
        </span>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </div>
      <p className="disclaimer" role="note">
        Design aid only, not a stamped engineering tool. Verify every design against the local code,
        the utility’s requirements and manufacturer datasheets.
      </p>
    </header>
  );
}
