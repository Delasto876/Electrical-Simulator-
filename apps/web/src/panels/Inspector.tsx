import { catalogById } from "../app/catalog";
import { useUi } from "../state/uiStore";
import { specRows } from "./specRows";

export function Inspector() {
  const id = useUi((s) => s.selectedCatalogId);
  const part = id ? catalogById.get(id) : undefined;

  if (!part) {
    return (
      <div className="panel">
        <h2 className="panel-title">Inspector</h2>
        <p className="empty">Select a part in the palette to see its data label and specs.</p>
      </div>
    );
  }

  const electrical =
    "electrical" in part ? (part.electrical as Record<string, unknown>) : undefined;
  const { lengthMm, widthMm, heightMm } = part.dimensions;

  return (
    <div className="panel">
      <h2 className="panel-title">Inspector</h2>
      {!part.verified && (
        <p className="badge-warning" role="status">
          ⚠ Unverified placeholder data: check the manufacturer datasheet.
        </p>
      )}
      <div className="nameplate" aria-label="Data label">
        <div className="nameplate-brand">{part.brand}</div>
        <div className="nameplate-model">{part.model}</div>
        {electrical && (
          <dl className="nameplate-grid">
            {specRows(electrical)
              .slice(0, 8)
              .map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
          </dl>
        )}
        <div className="nameplate-foot">ID {part.id}</div>
      </div>
      <h3 className="section-title">Specifications</h3>
      <table className="spec-table">
        <tbody>
          <tr>
            <th scope="row">Dimensions</th>
            <td>
              {lengthMm} × {widthMm} × {heightMm} mm
            </td>
          </tr>
          <tr>
            <th scope="row">Weight</th>
            <td>{part.weightKg} kg</td>
          </tr>
          {part.price && (
            <tr>
              <th scope="row">Price</th>
              <td>
                {part.price.amount} {part.price.currency} / {part.price.unit}
              </td>
            </tr>
          )}
          {electrical &&
            specRows(electrical).map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.value}</td>
              </tr>
            ))}
          <tr>
            <th scope="row">Ports</th>
            <td>{part.ports.map((p) => p.label ?? p.id).join(", ") || "—"}</td>
          </tr>
        </tbody>
      </table>
      {part.notes && <p className="hint">{part.notes}</p>}
    </div>
  );
}
