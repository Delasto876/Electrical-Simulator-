import { fmtMoney } from "../../lib/format";
import { priceBom } from "../../model/bomPricing";
import { useSceneModel } from "../../scene/useSceneModel";

/**
 * BOM tab (Phase 2 stub): quantities from the array layouts with catalog
 * prices. Quotation, markup, tax and CSV/XLSX/PDF export arrive in Phase 7.
 */
export function BomTable() {
  const { bom } = useSceneModel();
  if (bom.length === 0)
    return <p className="empty">Place a PV array to see its bill of materials.</p>;
  const { lines, total, currency, unpriced } = priceBom(bom);
  return (
    <div>
      <table className="bom-table" data-testid="bom-table">
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col">Variant / cut</th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              Unit price
            </th>
            <th scope="col" className="num">
              Line total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ line: b, part, unitPrice, lineTotal, currency: cur }) => (
            <tr key={`${b.catalogId}|${b.variant ?? ""}`} data-catalog-id={b.catalogId}>
              <td>
                {part ? `${part.brand} ${part.model}` : b.catalogId}
                {part && !part.verified && (
                  <span className="badge-unverified" title="Placeholder data">
                    unverified
                  </span>
                )}
              </td>
              <td>{[b.variant, b.detail].filter(Boolean).join(" · ") || "—"}</td>
              <td
                className="num"
                data-testid={`qty-${b.catalogId}${b.variant ? `-${Number.parseFloat(b.variant)}` : ""}`}
              >
                {b.qty} {b.unit === "each" ? "" : b.unit}
              </td>
              <td className="num">{unitPrice !== undefined ? fmtMoney(unitPrice, cur) : "—"}</td>
              <td className="num">{lineTotal !== undefined ? fmtMoney(lineTotal, cur) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>
              Subtotal (placeholder prices
              {unpriced ? `, ${unpriced} unpriced line${unpriced === 1 ? "" : "s"}` : ""})
            </th>
            <td className="num" data-testid="bom-total">
              {fmtMoney(total, currency)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="hint">
        Prices are editable catalog placeholders. Quotation, markup, tax and export arrive in Phase
        7.
      </p>
    </div>
  );
}
