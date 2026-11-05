import type { Part } from "@solar-sim/catalog";
import { specRows } from "../specRows";

/** Printed-style data label plus full spec table for any catalog part. */
export function Nameplate({ part, compact = false }: { part: Part; compact?: boolean }) {
  const spec =
    "electrical" in part
      ? (part.electrical as Record<string, unknown>)
      : "mounting" in part
        ? (part.mounting as Record<string, unknown>)
        : "attributes" in part
          ? (part.attributes as Record<string, unknown>)
          : undefined;
  const { lengthMm, widthMm, heightMm } = part.dimensions;
  return (
    <div>
      {!part.verified && (
        <p className="badge-warning" role="status">
          ⚠ Unverified placeholder data: check the manufacturer datasheet.
        </p>
      )}
      <div className="nameplate" aria-label="Data label">
        <div className="nameplate-brand">{part.brand}</div>
        <div className="nameplate-model">{part.model}</div>
        {spec && (
          <dl className="nameplate-grid">
            {specRows(spec)
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
      {!compact && (
        <>
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
              {spec &&
                specRows(spec).map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.value}</td>
                  </tr>
                ))}
              <tr>
                <th scope="row">Ports</th>
                <td>{part.ports.map((p) => p.label ?? p.id).join(", ") || "—"}</td>
              </tr>
              {part.modelUrl && (
                <tr>
                  <th scope="row">3D model</th>
                  <td>{part.modelUrl} (Blender)</td>
                </tr>
              )}
            </tbody>
          </table>
          {part.notes && <p className="hint">{part.notes}</p>}
        </>
      )}
    </div>
  );
}
