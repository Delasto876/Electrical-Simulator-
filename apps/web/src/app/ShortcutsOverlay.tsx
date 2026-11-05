import { useUi } from "../state/uiStore";
import { SHORTCUTS } from "./shortcuts";

export function ShortcutsOverlay() {
  const open = useUi((s) => s.showShortcuts);
  if (!open) return null;
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={() => useUi.getState().setShowShortcuts(false)}
    >
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table className="spec-table">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <th scope="row">
                  <kbd>{s.keys}</kbd>
                </th>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => useUi.getState().setShowShortcuts(false)} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}
