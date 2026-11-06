import { DEFAULT_CODE_PROFILE, getCodeProfile } from "@solar-sim/engine";
import { askConfirm } from "./dialogs";
import type { CameraPreset } from "../config/defaults";
import { buildExample, EXAMPLES } from "../model/examples";
import { startRacewayTool } from "./racewayTool";
import { runSimulation } from "../sim/runSimulation";
import { loadProject, redo, renameProject, setSetting, undo } from "../state/actions";
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
  const xray = useUi((s) => s.xray);
  const bondingView = useUi((s) => s.bondingView);
  const tool = useUi((s) => s.tool);
  const past = useProject((s) => s.past);
  const future = useProject((s) => s.future);
  const name = useProject((s) => s.project.meta.name);
  const settings = useProject((s) => s.project.settings);
  const profile =
    getCodeProfile(useProject((s) => s.project.codeProfileId)) ?? DEFAULT_CODE_PROFILE;
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
          data-testid="new-project"
          onClick={() => useUi.getState().setWizardOpen(true)}
          title="Start a new project with the step-by-step wizard"
        >
          ＋ New project
        </button>
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
        <div role="group" aria-label="Tools" className="seg">
          <button
            type="button"
            aria-pressed={tool.kind === "select"}
            title="Select and move (Esc)"
            onClick={() => useUi.getState().setTool({ kind: "select" })}
          >
            Select
          </button>
          <button
            type="button"
            aria-pressed={tool.kind === "cable"}
            title="Draw a cable: click a port, then another port (C)"
            onClick={() =>
              useUi
                .getState()
                .setTool(tool.kind === "cable" ? { kind: "select" } : { kind: "cable", from: null })
            }
          >
            Cable
          </button>
          <button
            type="button"
            aria-pressed={tool.kind === "raceway" && tool.raceway === "conduit"}
            title="Draw conduit: click points on the ground, walls, roof or equipment; click the last point again or Enter to finish (U)"
            onClick={() =>
              tool.kind === "raceway" && tool.raceway === "conduit"
                ? useUi.getState().setTool({ kind: "select" })
                : startRacewayTool("conduit")
            }
          >
            Conduit
          </button>
          <button
            type="button"
            aria-pressed={tool.kind === "raceway" && tool.raceway === "trunking"}
            title="Draw trunking / wireway; corners are mitred (T)"
            onClick={() =>
              tool.kind === "raceway" && tool.raceway === "trunking"
                ? useUi.getState().setTool({ kind: "select" })
                : startRacewayTool("trunking")
            }
          >
            Trunking
          </button>
        </div>
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
          aria-pressed={xray}
          title="See through enclosures, combiners and transfer switches (X)"
          onClick={() => useUi.getState().toggleXray()}
        >
          X-ray
        </button>
        <button
          type="button"
          aria-pressed={bondingView}
          title="Colour metal parts green when bonded to the ground rod, red when floating (B)"
          onClick={() => useUi.getState().toggleBondingView()}
        >
          Bonding
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
        <select
          aria-label="Load an example design"
          data-testid="examples"
          value=""
          onChange={(e) => {
            const ex = EXAMPLES.find((x) => x.id === e.target.value);
            if (!ex) return;
            void askConfirm(
              `Open the example “${ex.name}” as a new project? Your current design stays in this browser's storage, but there is no project list to reopen it yet: export it first if you need it.`,
              "Open example",
            ).then((ok) => ok && loadProject(buildExample(ex.id)));
          }}
        >
          <option value="">Examples…</option>
          {EXAMPLES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Add a tree, tank or building that can shade the array"
          data-testid="obstacles"
          value=""
          onChange={(e) => {
            const k = e.target.value as "tree" | "tank" | "building" | "";
            if (k) useUi.getState().setTool({ kind: "obstruction", obstruction: k });
          }}
        >
          <option value="">Obstacles…</option>
          <option value="tree">Tree</option>
          <option value="tank">Water tank</option>
          <option value="building">Neighbouring building</option>
        </select>
        <button
          type="button"
          className="primary"
          title="Simulate a day, month or year with real weather (Simulation tab)"
          data-testid="simulate"
          onClick={() => {
            useUi.getState().setBottomTab("simulation");
            void runSimulation();
          }}
        >
          Simulate
        </button>
      </nav>
      <div className="toolbar-right">
        <span className="profile-chip" title={profile.caveat} data-testid="code-profile">
          Code profile: <strong>{profile.id}</strong>
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
