import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  checkDraft,
  draftToPart,
  emptyDraft,
  SPEC_FIELDS,
  TEMPLATE_LABEL,
  type Draft,
} from "../model/customPackage";
import {
  CUSTOM_TEMPLATES,
  IMAGE_SLOTS,
  useCustomParts,
  type CustomTemplate,
  type CustomTerminal,
  type ImageSlot,
  type TerminalKind,
  type TerminalPolarity,
} from "../state/customParts";
import { showToast, useView } from "../state/wbView";
import { Modal } from "./Dialogs";
import { PhotoEditor, pixelsToDataUrl, type PhotoResult } from "./PhotoEditor";

/**
 * ADD CUSTOM PART — a guided wizard: pick what kind of product it is, add
 * photos (straighten, crop, remove background, set the scale), enter its size
 * and ratings, mark its terminals on the photo, and save it to the library.
 * The saved part is marked user-uploaded and user-verified; the numbers are as
 * good as what was typed from the datasheet.
 */
const STEPS = ["Type", "Photos", "Size and ratings", "Terminals", "Save"] as const;

const SLOT_LABEL: Record<ImageSlot, string> = {
  front: "Front",
  left: "Left side",
  right: "Right side",
  top: "Top",
  back: "Back",
  inside: "Inside",
  label: "Rating label",
  terminals: "Terminals close-up",
};

const TERMINAL_KINDS: TerminalKind[] = ["screw", "spring", "lug", "mc4", "bus"];
const POLARITIES: TerminalPolarity[] = ["L1", "L2", "L3", "N", "PE", "+", "-", "none"];

export function PartWizard() {
  const open = useView((s) => s.wizardOpen);
  return open ? <WizardBody /> : null;
}

function WizardBody() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slot, setSlot] = useState<ImageSlot>("front");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const close = () => useView.getState().set({ wizardOpen: false });
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const pickTemplate = (t: CustomTemplate) => {
    const d = emptyDraft(t);
    setDraft(d);
    setStep(1);
  };

  const useImage = (r: PhotoResult) => {
    if (!draft) return;
    patch({ images: { ...draft.images, [slot]: pixelsToDataUrl(r.pixels) } });
    if (slot === "front" && r.mmPerPx) {
      setMmPerPx(r.mmPerPx);
      const w = Math.round(r.pixels.width * r.mmPerPx);
      const h = Math.round(r.pixels.height * r.mmPerPx);
      patch({
        images: { ...draft.images, [slot]: pixelsToDataUrl(r.pixels) },
        dimsMm: { ...draft.dimsMm, w, h },
      });
      setNote(
        `Front photo saved. Width and height set from the scale: ${w} × ${h} mm. Enter the depth next.`,
      );
    } else setNote(`${SLOT_LABEL[slot]} photo saved.`);
    setEditing(false);
  };

  if (!draft || step === 0)
    return (
      <Modal title="Add custom part" onClose={close} wide>
        <h2>Add custom part</h2>
        <p className="wb-hint">
          What kind of product is it? The kind decides the 3D shape, how it snaps and which ratings
          are asked.
        </p>
        <div className="wb-template-grid">
          {CUSTOM_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              className="wb-btn wb-template"
              data-testid={`template-${t}`}
              onClick={() => pickTemplate(t)}
            >
              <strong>{TEMPLATE_LABEL[t]}</strong>
              <span className="wb-hint">
                {t === "din-breaker" && "Snaps onto a 35 mm DIN rail in 18 mm modules."}
                {t === "din-enclosure" && "A box with DIN rails inside that breakers click onto."}
                {t === "transfer-switch" && "Two-source changeover switch, manual or automatic."}
              </span>
            </button>
          ))}
        </div>
        <div className="wb-modal-actions">
          <button type="button" className="wb-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </Modal>
    );

  const { errors, warnings } = checkDraft(draft);
  const front = draft.images.front;
  const addTerminal = (u: number, v: number) => {
    const n = draft.terminals.length + 1;
    const t: CustomTerminal = {
      id: `t${n}`,
      label: `Terminal ${n}`,
      kind: "screw",
      polarity: "none",
      ratingA: null,
      wireRange: "",
      torqueNm: null,
      face: "front",
      u,
      v,
    };
    patch({ terminals: [...draft.terminals, t] });
  };
  const setTerminal = (i: number, p: Partial<CustomTerminal>) =>
    patch({ terminals: draft.terminals.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  const save = () => {
    try {
      const taken = new Set(Object.keys(useCustomParts.getState().parts));
      const part = draftToPart(draft, taken);
      useCustomParts.getState().add(part);
      useView.getState().set({ wizardOpen: false, libraryPart: part.id, selection: null });
      showToast(`Saved “${part.name}” to My parts. Place it from the library.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title="Add custom part" onClose={close} wide>
      <h2>Add custom part · {TEMPLATE_LABEL[draft.template]}</h2>
      <ol className="wb-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i === step ? "is-current" : i < step ? "is-done" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <button type="button" onClick={() => setStep(i)} data-testid={`wiz-step-${i}`}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      {note && (
        <p className="wb-note" role="status" data-testid="wiz-note">
          {note}
        </p>
      )}

      {step === 1 && (
        <div className="wb-wiz-photos">
          <div className="wb-slots" role="tablist" aria-label="Photo slot">
            {IMAGE_SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === slot}
                className={`wb-btn${s === slot ? " is-on" : ""}`}
                data-testid={`slot-${s}`}
                onClick={() => {
                  setSlot(s);
                  setEditing(false);
                }}
              >
                {SLOT_LABEL[s]}
                {draft.images[s] ? " ✓" : ""}
              </button>
            ))}
          </div>
          {draft.images[slot] && !editing ? (
            <div className="wb-slot-have">
              <img
                src={draft.images[slot]}
                alt={`${SLOT_LABEL[slot]} photo`}
                className="wb-slot-img"
              />
              <button
                type="button"
                className="wb-btn"
                onClick={() => patch({ images: omit(draft.images, slot) })}
              >
                <Trash2 size={14} aria-hidden /> Remove this photo
              </button>
            </div>
          ) : (
            <PhotoEditor key={slot} onUse={useImage} onNote={setNote} />
          )}
          <p className="wb-hint">
            One front photo is enough: the 3D part is a box with that photo on its front, marked
            “approximate”. Add side or back photos for a better model, or skip photos and use only
            the size.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="wb-wiz-form">
          <label>
            Name
            <input
              className="wb-input"
              value={draft.name}
              data-testid="wiz-name"
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Hager MCB 20 A C-curve"
            />
          </label>
          <label>
            Brand
            <input
              className="wb-input"
              value={draft.brand}
              onChange={(e) => patch({ brand: e.target.value })}
            />
          </label>
          <label>
            Model number
            <input
              className="wb-input"
              value={draft.model}
              onChange={(e) => patch({ model: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Size (mm){mmPerPx ? " — width and height from the photo scale" : ""}</legend>
            {(["w", "h", "d"] as const).map((k) => (
              <label key={k}>
                {{ w: "Width", h: "Height", d: "Depth" }[k]}
                <input
                  className="wb-input wb-input-num"
                  type="number"
                  min={1}
                  value={draft.dimsMm[k]}
                  data-testid={`wiz-dim-${k}`}
                  onChange={(e) =>
                    patch({ dimsMm: { ...draft.dimsMm, [k]: Number(e.target.value) } })
                  }
                />
              </label>
            ))}
            <label>
              Weight (kg)
              <input
                className="wb-input wb-input-num"
                type="number"
                min={0}
                step={0.05}
                value={draft.weightKg}
                onChange={(e) => patch({ weightKg: Number(e.target.value) })}
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>Ratings from the datasheet</legend>
            {SPEC_FIELDS[draft.template].map((f) => (
              <label key={f.key}>
                {f.label}
                {f.kind === "choice" ? (
                  <select
                    value={String(draft.specs[f.key])}
                    onChange={(e) => patch({ specs: { ...draft.specs, [f.key]: e.target.value } })}
                    data-testid={`spec-${f.key}`}
                  >
                    {f.choices!.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="wb-input"
                    type={f.kind === "number" ? "number" : "text"}
                    value={String(draft.specs[f.key] ?? "")}
                    data-testid={`spec-${f.key}`}
                    onChange={(e) => {
                      const v = f.kind === "number" ? Number(e.target.value) : e.target.value;
                      const specs = { ...draft.specs, [f.key]: v };
                      // a DIN breaker is as wide as its modules (18 mm each)
                      if (draft.template === "din-breaker" && f.key === "modules")
                        return patch({
                          specs,
                          dimsMm: { ...draft.dimsMm, w: Math.max(1, Number(v)) * 18 },
                        });
                      patch({ specs });
                    }}
                  />
                )}
                {f.unit && <span className="wb-unit">{f.unit}</span>}
              </label>
            ))}
          </fieldset>
          {draft.template === "din-breaker" && (
            <p className="wb-hint">
              DIN snap: the breaker clicks onto a 35 mm rail in 18 mm modules. Its width follows the
              module count.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="wb-wiz-terminals">
          {front ? (
            <>
              <p className="wb-hint">
                Click on the front photo where each terminal is. Wires can be connected to these
                points later.
              </p>
              <div
                className="wb-photo-stage wb-term-stage"
                data-testid="terminal-stage"
                role="group"
                aria-label="Front photo: click to add a terminal"
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  addTerminal((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
              >
                <img src={front} alt="Front of the part" draggable={false} />
                {draft.terminals.map((t) => (
                  <span
                    key={t.id}
                    className="wb-handle wb-handle-dot"
                    style={{ left: `${t.u * 100}%`, top: `${t.v * 100}%` }}
                    title={t.label}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="wb-hint">
              Add a front photo first (step 2) to mark terminals on it. You can also skip terminals.
            </p>
          )}
          <ul className="wb-term-list" data-testid="terminal-list">
            {draft.terminals.map((t, i) => (
              <li key={t.id}>
                <input
                  className="wb-input"
                  aria-label={`Terminal ${i + 1} name`}
                  value={t.label}
                  onChange={(e) => setTerminal(i, { label: e.target.value })}
                />
                <select
                  aria-label={`Terminal ${i + 1} kind`}
                  value={t.kind}
                  onChange={(e) => setTerminal(i, { kind: e.target.value as TerminalKind })}
                >
                  {TERMINAL_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <select
                  aria-label={`Terminal ${i + 1} polarity`}
                  value={t.polarity}
                  onChange={(e) => setTerminal(i, { polarity: e.target.value as TerminalPolarity })}
                >
                  {POLARITIES.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <input
                  className="wb-input"
                  aria-label={`Terminal ${i + 1} wire range`}
                  placeholder="wire range, e.g. 1-25 mm²"
                  value={t.wireRange}
                  onChange={(e) => setTerminal(i, { wireRange: e.target.value })}
                />
                <button
                  type="button"
                  className="wb-mini"
                  aria-label={`Delete terminal ${i + 1}`}
                  onClick={() => patch({ terminals: draft.terminals.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 4 && (
        <div className="wb-wiz-review">
          <dl className="wb-nameplate">
            <div>
              <dt>Name</dt>
              <dd>{draft.name || "—"}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{TEMPLATE_LABEL[draft.template]}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {draft.dimsMm.w} × {draft.dimsMm.h} × {draft.dimsMm.d} mm
              </dd>
            </div>
            <div>
              <dt>Photos</dt>
              <dd>
                {IMAGE_SLOTS.filter((s) => draft.images[s])
                  .map((s) => SLOT_LABEL[s])
                  .join(", ") || "none"}
              </dd>
            </div>
            <div>
              <dt>Terminals</dt>
              <dd>{draft.terminals.length}</dd>
            </div>
          </dl>
          {errors.map((e) => (
            <p key={e} className="wb-warn" role="alert">
              {e}
            </p>
          ))}
          {warnings.map((w) => (
            <p key={w} className="wb-hint">
              {w}
            </p>
          ))}
          <p className="wb-hint">
            Saved as a user-uploaded part, <strong>user-verified</strong>: the numbers are only as
            good as what you entered from the datasheet.
          </p>
        </div>
      )}

      <div className="wb-modal-actions">
        <button type="button" className="wb-btn" onClick={close}>
          Cancel
        </button>
        {step > 1 && (
          <button type="button" className="wb-btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            onClick={() => setStep(step + 1)}
            data-testid="wiz-next"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            disabled={errors.length > 0}
            onClick={save}
            data-testid="wiz-save"
          >
            Save to My parts
          </button>
        )}
      </div>
    </Modal>
  );
}

function omit<T extends object>(o: T, k: keyof T): T {
  const c = { ...o };
  delete c[k];
  return c;
}
