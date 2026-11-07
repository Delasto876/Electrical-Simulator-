import { useState } from "react";
import { UNIT_LABEL, UNITS, evalLength, formatLength, type Unit } from "../lib/units";
import { gapCommand, rowGaps, rowOf, spaceRowCommand } from "../model/footRows";
import { useWb } from "../state/wbStore";
import { showToast } from "../state/wbView";
import { LengthField } from "./Fields";
import { partDims } from "../model/partDims";
import { useDoc } from "../state/wbStore";
import { useView } from "../state/wbView";
import { Row, Section } from "./Fields";

/** The unit lengths are shown and typed in: the same setting as the status bar, right where you read the sizes. */
export function UnitPicker({ testid = "unit-picker" }: { testid?: string }) {
  const unit = useView((s) => s.units);
  return (
    <label className="wb-unitpick">
      Units
      <select
        value={unit}
        data-testid={testid}
        onChange={(e) => useView.getState().set({ units: e.target.value as Unit })}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {UNIT_LABEL[u]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Size of the selected part in the chosen unit (also drawn as dimension lines on the canvas). */
export function DimensionsSection({ partId }: { partId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const p = doc.parts[partId];
  const dims = p ? partDims(doc, p) : undefined;
  if (!dims) return null;
  const f = (m: number) => formatLength(m, unit, unit === "mm" ? 0 : 2);
  return (
    <Section title="Dimensions">
      <UnitPicker />
      <Row label={dims.labels[0]}>
        <span data-testid="dim-w">{f(dims.w)}</span>
      </Row>
      <Row label={dims.labels[1]}>
        <span data-testid="dim-d">{f(dims.d)}</span>
      </Row>
      <Row label={dims.labels[2]}>
        <span data-testid="dim-h">{f(dims.h)}</span>
      </Row>
    </Section>
  );
}

/** An L-foot's row: the distance to the foot before it (type it to move this foot), every gap, and re-space the row. */
export function FootSpacingSection({ partId }: { partId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const [even, setEven] = useState("");
  const row = rowOf(doc, partId);
  if (row.length === 0) return null;
  const i = row.findIndex((q) => q.id === partId);
  const gaps = rowGaps(row);
  const f = (m: number) => formatLength(m, unit, unit === "mm" ? 0 : 2);
  const name = (id: string) => Object.values(doc.nodes).find((n) => n.partId === id)?.name ?? id;
  const applyEven = () => {
    const m = evalLength(even, unit);
    if (!m || m <= 0)
      return showToast("Type the distance between the feet, e.g. 1200 or 48in.", "warn");
    const cmd = spaceRowCommand(doc, partId, m);
    if (cmd) useWb.getState().dispatch(cmd);
  };
  return (
    <Section title="Spacing in the row">
      <UnitPicker testid="unit-picker-row" />
      <Row label="Feet in this row">{row.length}</Row>
      {i > 0 ? (
        <LengthField
          id="foot-gap-prev"
          label={`From ${name(row[i - 1]!.id)}`}
          valueM={gaps[i - 1]!}
          unit={unit}
          minM={0.01}
          maxM={60}
          onCommit={(m) => {
            const cmd = gapCommand(doc, partId, m);
            if (cmd) useWb.getState().dispatch(cmd);
          }}
        />
      ) : (
        <p className="wb-hint">The first foot of the row (the others are measured from it).</p>
      )}
      {i < row.length - 1 && (
        <Row label={`To ${name(row[i + 1]!.id)}`}>
          <span data-testid="foot-gap-next">{f(gaps[i]!)}</span>
        </Row>
      )}
      {gaps.length > 0 && (
        <Row label="Gaps, left to right">
          <span data-testid="foot-gaps">{gaps.map(f).join(" · ")}</span>
        </Row>
      )}
      {row.length > 1 && (
        <div className="wb-inline-form">
          <label>
            Space all at
            <input
              className="wb-input"
              value={even}
              inputMode="decimal"
              placeholder={unit === "ft" || unit === "ft-in" ? `4'` : "1200"}
              data-testid="row-space-all"
              onChange={(e) => setEven(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyEven())}
            />
          </label>
          <button
            type="button"
            className="wb-btn"
            onClick={applyEven}
            data-testid="row-space-apply"
          >
            Apply
          </button>
        </div>
      )}
    </Section>
  );
}
