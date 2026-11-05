import { fmtM } from "../../lib/format";
import { FT, tradeSizeLabel } from "../../model/racewayModel";
import { useProject } from "../../state/projectStore";
import { useUi } from "../../state/uiStore";
import { useSceneModel } from "../../scene/useSceneModel";

/** Fabrication list: rail cuts, conduit bends and sticks, trunking mitre cuts. */
export function CutList() {
  const { arrays, raceways } = useSceneModel();
  const units = useProject((s) => s.project.settings.lengthUnits);
  const runs = [...raceways.byId.values()].filter((r) => !r.run.hidden);
  const rails = [...arrays.values()].filter((a) => a.layout && !a.array.hidden);
  if (runs.length === 0 && rails.length === 0)
    return (
      <p className="empty">
        Nothing to cut yet: place an array, or draw conduit / trunking (U / T).
      </p>
    );
  const open = (id: string) => useUi.getState().select({ kind: "raceway", id });
  return (
    <div className="cut-list" data-testid="cut-list-tab">
      {rails.length > 0 && (
        <>
          <h3 className="section-title">Rails</h3>
          <table className="spec-table">
            <tbody>
              {rails.flatMap((a) =>
                a.layout!.railRuns.map((r) => (
                  <tr key={`${a.array.id}-${r.row}-${r.side}`}>
                    <th scope="row">
                      {a.array.name} row {r.row + 1} {r.side}
                    </th>
                    <td>
                      {r.pieces
                        .map((p) =>
                          p.cutMm < p.stockMm
                            ? `${p.stockMm}→${Math.round(p.cutMm)}`
                            : `${p.stockMm}`,
                        )
                        .join(" + ")}{" "}
                      mm · {r.splices} splice{r.splices === 1 ? "" : "s"}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </>
      )}
      {runs.some((r) => r.spec.kind === "conduit") && (
        <>
          <h3 className="section-title">Conduit</h3>
          <table className="spec-table" data-testid="cut-list-conduit">
            <thead>
              <tr>
                <th>Run</th>
                <th>Type / size</th>
                <th>Length</th>
                <th>Bends (between pull points)</th>
                <th>Radius</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {runs
                .filter((r) => r.spec.kind === "conduit")
                .map((r) => (
                  <tr key={r.run.id}>
                    <th scope="row">
                      <button type="button" className="link" onClick={() => open(r.run.id)}>
                        {r.run.name}
                      </button>
                    </th>
                    <td>
                      {tradeSizeLabel(r.spec.size)} {r.spec.family.toUpperCase()}
                    </td>
                    <td>{fmtM(r.path.lengthM, units, 2)}</td>
                    <td>
                      {r.sections
                        .map((s) =>
                          s.bends.length
                            ? s.bends.map((b) => `${b.deg.toFixed(0)}°`).join("+")
                            : "straight",
                        )
                        .join(" | ")}
                    </td>
                    <td>{r.bendRadiusIn} in</td>
                    <td>
                      {r.spec.stockFt
                        ? `${r.stock?.stocks ?? 0} × ${r.spec.stockFt} ft sticks; pieces ${
                            r.stock?.layout
                              .flat()
                              .map((x) => `${(x * 12).toFixed(1)}″`)
                              .join(", ") ?? ""
                          }`
                        : `${Math.ceil(r.path.lengthM / FT)} ft`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
      {runs.some((r) => r.spec.kind === "trunking") && (
        <>
          <h3 className="section-title">Trunking (mitred corners)</h3>
          <table className="spec-table" data-testid="cut-list-trunking">
            <thead>
              <tr>
                <th>Run / piece</th>
                <th>Long edge</th>
                <th>Short edge</th>
                <th>Cut at start / end</th>
              </tr>
            </thead>
            <tbody>
              {runs
                .filter((r) => r.spec.kind === "trunking")
                .flatMap((r) =>
                  (r.mitre?.pieces ?? []).map((p) => (
                    <tr key={`${r.run.id}-${p.index}`}>
                      <th scope="row">
                        {r.run.name} #{p.index + 1} ({r.spec.size})
                      </th>
                      <td>{fmtM(Math.max(p.leftM, p.rightM), units, 3)}</td>
                      <td>{fmtM(Math.min(p.leftM, p.rightM), units, 3)}</td>
                      <td>
                        {p.startMitreDeg.toFixed(1)}° / {p.endMitreDeg.toFixed(1)}°
                      </td>
                    </tr>
                  )),
                )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
