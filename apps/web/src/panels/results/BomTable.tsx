import { bomRows } from "../../reports/bomReport";
import { useSceneModel } from "../../scene/useSceneModel";
import { ExportButtons } from "../reports/ExportButtons";

/**
 * BOM tab: quantities from the design, grouped by category (no prices).
 * Export as CSV, Excel or PDF with the company title block.
 */
export function BomTable() {
  const { bom } = useSceneModel();
  if (bom.length === 0)
    return <p className="empty">Place a PV array to see its bill of materials.</p>;
  const rows = bomRows(bom);
  return (
    <div>
      <div className="report-toolbar">
        <strong>Bill of materials</strong>
        <span className="muted">{rows.length} lines · export as</span>
        <ExportButtons kind="bom" formats={["csv", "xlsx", "pdf"]} />
      </div>
      <table className="bom-table" data-testid="bom-table">
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Part</th>
            <th scope="col">Variant / cut</th>
            <th scope="col" className="num">
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const head = i === 0 || rows[i - 1]!.section !== r.section;
            return [
              head && (
                <tr key={`h-${r.section}`} className="bom-section">
                  <th colSpan={4} scope="colgroup">
                    {r.section}
                  </th>
                </tr>
              ),
              <tr key={`${r.catalogId}|${r.detail}`} data-catalog-id={r.catalogId}>
                <td className="num muted">{r.item}</td>
                <td>
                  {r.description}
                  {!r.verified && (
                    <span className="badge-unverified" title="Placeholder data">
                      unverified
                    </span>
                  )}
                </td>
                <td>{r.detail || "—"}</td>
                <td
                  className="num"
                  data-testid={`qty-${r.catalogId}${r.variant ? `-${Number.parseFloat(r.variant)}` : ""}`}
                >
                  {r.qty} {r.unit === "ea" ? "" : r.unit}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
