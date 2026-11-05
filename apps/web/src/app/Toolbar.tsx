import { DEFAULT_CODE_PROFILE } from "@solar-sim/engine";
import type { CameraPreset } from "../config/defaults";
import { redo, renameProject, setSetting, undo } from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

const VIEWS: { id: CameraPreset; label: string; key: string }[] = [
  { id: "orbit", label: "3D", key: "1" },
  { id: "top", label: "Top", key: "2" },
  { id: "front", label: "Front", key: "3" },
  { id: "side", label: "Side", key: "4" },
];

export function Toolbar() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const camera = useUi((s) => s.camera);
  const exploded = useUi((s) => s.exploded);
  const past = useProject((s) => s.past);
  const future = useProject((s) => s.future);
  const name = useProject((s) => s.project.meta.name);
  const settings = useProject((s) => s.project.settings);
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ☀
        </span>
        <span>Solar Design Simulator</span>
        <input
          className="project-name"
          aria-label="Project name"
          value={name}
          onChange={(e) => renameProject(e.target.value)}
        />
      </div>
      <nav className="toolbar-actions" aria-label="Main actions">
        <button
          type="button"
          onClick={undo}
          disabled={past.length === 0}
          title={past.length ? `Undo ${past.at(-1)!.label} (Ctrl+Z)` : "Nothing to undo"}
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={future.length === 0}
          title={future.length ? `Redo ${future[0]!.label} (Ctrl+Shift+Z)` : "Nothing to redo"}
        >
          ↷ Redo
        </button>
        <span className="toolbar-sep" aria-hidden />
        <div role="group" aria-label="Camera view" className="seg">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={camera === v.id}
              title={`${v.label} view (${v.key})`}
              onClick={() => useUi.getState().setCamera(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={exploded}
          title="Exploded hardware view (E)"
          onClick={() => useUi.getState().toggleExploded()}
        >
          Explode
        </button>
        <button
          type="button"
          aria-pressed={settings.gridSnap}
          title="Grid snap (G)"
          onClick={() => setSetting("gridSnap", !settings.gridSnap)}
        >
          Snap
        </button>
        <button
          type="button"
          title="Switch length units"
          onClick={() =>
            setSetting("lengthUnits", settings.lengthUnits === "metric" ? "imperial" : "metric")
          }
          data-testid="units-toggle"
        >
          {settings.lengthUnits === "metric" ? "mm / m" : "in / ft"}
        </button>
        <button type="button" disabled title="Available from Phase 6">
          Simulate
        </button>
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
          onClick={() => useUi.getState().setShowShortcuts(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
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
