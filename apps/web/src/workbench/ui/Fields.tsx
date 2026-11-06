import { useId, useState, type ReactNode } from "react";
import { evalLength, formatLength, lengthFieldValue, type Unit } from "../lib/units";

/** Label + control row of the Properties panel. */
export function Row({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="wb-prop-row">
      <label htmlFor={htmlFor}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

/**
 * A length field in the active unit. Type a number, a unit (0.75m, 750mm,
 * 2'6") and press Enter or leave the field; a bad value is flagged and not applied.
 */
export function LengthField({
  id,
  label,
  valueM,
  unit,
  minM,
  maxM,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  valueM: number;
  unit: Unit;
  minM: number;
  maxM: number;
  disabled?: boolean;
  onCommit: (m: number) => void;
}) {
  // `edit` is what the user is typing; null shows the stored value in the current unit
  const [edit, setEdit] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const err = useId();
  const text = edit ?? lengthFieldValue(valueM, unit);
  const reset = () => {
    setEdit(null);
    setBad(null);
  };
  const commit = () => {
    if (edit === null) return;
    const m = evalLength(text, unit);
    if (m === undefined) return setBad("Not a length. Try 600, 600+25, 0.75m or 2'6\".");
    if (m < minM - 1e-9 || m > maxM + 1e-9)
      return setBad(`Allowed: ${formatLength(minM, unit)} to ${formatLength(maxM, unit)}.`);
    if (Math.abs(m - valueM) > 1e-9) onCommit(m);
    reset();
  };
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        className={`wb-input${bad ? " is-bad" : ""}`}
        value={text}
        disabled={disabled}
        inputMode="decimal"
        aria-invalid={!!bad}
        aria-describedby={bad ? err : undefined}
        onChange={(e) => setEdit(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") reset();
        }}
      />
      <span className="wb-unit">{unit === "ft-in" ? "ft-in" : unit}</span>
      {bad && (
        <span id={err} className="wb-fielderr" role="alert">
          {bad}
        </span>
      )}
    </Row>
  );
}

/** A number with a slider and a typed value (angles). Slider drags merge into one timeline card. */
export function AngleField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        className="wb-input wb-input-num"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v))
            onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      <span className="wb-unit">°</span>
      <input
        type="range"
        className="wb-range"
        aria-label={`${label} slider`}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Row>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <Row label={label} htmlFor={id}>
      <select
        id={id}
        className="wb-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function CheckField({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Row>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="wb-prop-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
