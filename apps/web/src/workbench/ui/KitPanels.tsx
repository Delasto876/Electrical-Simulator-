import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import type { Kit } from "../../config/kits";
import { kitCardId, kitFill, kitList, kitOf } from "../model/kits";
import {
  COMBINER_LIMITS,
  combinerId,
  combinerProblem,
  type CombinerOptions,
} from "../model/combinerBuilder";
import { partInfo } from "../model/partInfo";
import { placeAtViewCentre, startPlacing } from "../state/placeActions";
import { useView } from "../state/wbView";
import { PartPreview } from "./PartPanels";
import { Row, Section } from "./Fields";
import { Tip } from "./Tip";

/**
 * KITS in the UI: the "Ready-made boxes" group of the Parts Library and the
 * kit preview in the Properties panel. A kit places like a part (drag the card,
 * double-click it, or "Place on surface"); its devices come with it.
 */
const matches = (k: Kit, q: string) =>
  !q || `${k.name} ${k.description} ${k.tags.join(" ")} kit box`.toLowerCase().includes(q);

export function LibraryKits({
  query,
  selected,
  onCardPointerDown,
}: {
  query: string;
  selected: string | null;
  onCardPointerDown: (e: React.PointerEvent, id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const q = query.trim().toLowerCase();
  const kits = kitList().filter((k) => matches(k, q));
  if (kits.length === 0) return null;
  const isOpen = open || q !== "";
  return (
    <section className="wb-libgroup" data-testid="library-kits">
      <button
        type="button"
        className="wb-libgroup-head"
        aria-expanded={isOpen}
        onClick={() => setOpen((o) => !o)}
        data-testid="libgroup-kits"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Ready-made boxes</span>
        <span className="wb-count">{kits.length}</span>
      </button>
      {isOpen && (
        <ul className="wb-cards">
          {kits.map((k) => {
            const id = kitCardId(k);
            const fill = kitFill(k);
            return (
              <li key={k.id}>
                <button
                  type="button"
                  className={`wb-card${selected === id ? " is-selected" : ""}`}
                  aria-pressed={selected === id}
                  data-testid={`card-${k.id}`}
                  title={k.description}
                  onPointerDown={(e) => onCardPointerDown(e, id)}
                  onDoubleClick={() => placeAtViewCentre(id)}
                  onClick={() =>
                    useView.getState().set({
                      libraryPart: id,
                      selection: null,
                      layout: { ...useView.getState().layout, rightOpen: true },
                    })
                  }
                >
                  <span className="wb-card-thumb wb-kit-thumb" aria-hidden>
                    KIT
                  </span>
                  <span className="wb-card-body">
                    <span className="wb-card-name">{k.name}</span>
                    <span className="wb-chips">
                      <span className="wb-chip">{k.devices.length} devices</span>
                      <span className="wb-chip">
                        {fill.used}/{fill.total} modules
                      </span>
                      <span className="wb-chip wb-chip-warn">unverified</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {isOpen && <CombinerBuilder />}
    </section>
  );
}

/** Build a PV combiner from inputs, outputs, protection, SPD and isolator; preview it in Properties. */
function CombinerBuilder() {
  const [o, setO] = useState<CombinerOptions>({
    inputs: 4,
    outputs: 2,
    protection: "mcb",
    spd: true,
    isolator: true,
  });
  const why = combinerProblem(o);
  const set = (p: Partial<CombinerOptions>) => setO((x) => ({ ...x, ...p }));
  const num = (v: string) => Math.round(Number(v) || 0);
  return (
    <details className="wb-combiner" data-testid="combiner-builder">
      <summary>Build a PV combiner…</summary>
      <div className="wb-combiner-form">
        <label>
          Strings in{" "}
          <input
            type="number"
            className="wb-input"
            min={1}
            max={COMBINER_LIMITS.maxInputs}
            value={o.inputs}
            data-testid="combiner-inputs"
            onChange={(e) => set({ inputs: num(e.target.value) })}
          />
        </label>
        <label>
          Outputs{" "}
          <input
            type="number"
            className="wb-input"
            min={1}
            max={COMBINER_LIMITS.maxOutputs}
            value={o.outputs}
            data-testid="combiner-outputs"
            onChange={(e) => set({ outputs: num(e.target.value) })}
          />
        </label>
        <label>
          Protection{" "}
          <select
            className="wb-input"
            value={o.protection}
            data-testid="combiner-protection"
            onChange={(e) => set({ protection: e.target.value as CombinerOptions["protection"] })}
          >
            <option value="mcb">2P DC breaker per string</option>
            <option value="fuse">gPV fuse in + and −</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={o.spd}
            data-testid="combiner-spd"
            onChange={(e) => set({ spd: e.target.checked })}
          />{" "}
          DC SPD per output
        </label>
        <label>
          <input
            type="checkbox"
            checked={o.isolator}
            data-testid="combiner-isolator"
            onChange={(e) => set({ isolator: e.target.checked })}
          />{" "}
          DC isolator per output
        </label>
        {why && (
          <p className="wb-warn" role="status" data-testid="combiner-problem">
            {why}
          </p>
        )}
        <button
          type="button"
          className="wb-btn wb-btn-ok"
          data-testid="combiner-preview"
          disabled={!!why}
          title={why ?? "Show the layout in Properties, then place it"}
          onClick={() =>
            useView.getState().set({
              libraryPart: `kit:${combinerId(o)}`,
              selection: null,
              layout: { ...useView.getState().layout, rightOpen: true },
            })
          }
        >
          Preview layout
        </button>
      </div>
    </details>
  );
}

/** The kit preview: what is in the box, slot by slot. */
export function KitProperties({ id }: { id: string }) {
  const kit = kitOf(id);
  if (!kit) return null;
  const enc = partInfo(kit.enclosureId);
  const fill = kitFill(kit);
  return (
    <>
      {enc && <PartPreview info={enc} />}
      <Section title={kit.name}>
        <p className="wb-hint">{kit.description}</p>
        <p className="wb-warn" role="status">
          <ShieldAlert size={14} aria-hidden /> A typical layout with unverified catalog parts.
          Check every rating against your design.
        </p>
        <Tip
          title="Place on surface"
          body="Places the box with its devices already on the rail, as one step. Each device can then be moved, swapped or deleted."
        >
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            data-testid="place-kit"
            onClick={() => startPlacing(id)}
          >
            Place on surface
          </button>
        </Tip>
      </Section>
      <Section title="In the box">
        <Row label="Enclosure">{enc?.label ?? kit.enclosureId}</Row>
        <Row label="Rail">
          {fill.used} of {fill.total} modules used
        </Row>
        <ol className="wb-kit-list" data-testid="kit-devices">
          {kit.devices.map((d, i) => {
            const di = partInfo(d.catalogId);
            return (
              <li key={i}>
                <span className="wb-kit-slot">
                  {kit.devices.some((x) => x.row > 0) ? `R${d.row + 1} ` : ""}
                  {d.slot + 1}–{d.slot + (di?.dinModules ?? 1)}
                </span>{" "}
                {d.label && <strong>{d.label} · </strong>}
                {di?.label ?? d.catalogId}
              </li>
            );
          })}
        </ol>
      </Section>
    </>
  );
}
