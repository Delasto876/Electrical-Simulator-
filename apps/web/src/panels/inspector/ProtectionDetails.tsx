import { useState } from "react";
import { isCategory, type Part } from "@solar-sim/catalog";
import { catalogById, partLabel, partsOf } from "../../app/catalog";
import { isDinDevice, railOccupancy } from "../../model/placement";
import { swapOptions } from "../../model/swap";
import { mountDevice, swapPart } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { useUi } from "../../state/uiStore";
import { useSceneModel } from "../../scene/useSceneModel";
import { Field, Readout, Section } from "./fields";

/**
 * Phase 4 inspector sections for placed parts: enclosure rail, protective
 * device checks, ATS sources, ground rods and the bonding status. Display
 * only — every number comes from the scene model.
 */
export function ProtectionDetails({ partId, part }: { partId: string; part: Part }) {
  return (
    <>
      {isCategory(part, "enclosure") && <EnclosureRail partId={partId} part={part} />}
      <DeviceCheckSection partId={partId} />
      {isCategory(part, "ats") && <AtsSection partId={partId} />}
      {isCategory(part, "grounding") && part.grounding.kind === "ground-rod" && (
        <GroundRodSection partId={partId} />
      )}
      <BondingStatus id={partId} />
      <SwapSection partId={partId} part={part} />
    </>
  );
}

const labelOf = (catalogId: string) => {
  const c = catalogById.get(catalogId);
  return c ? partLabel(c) : catalogId;
};
const fmtA = (a: number | undefined) => (a === undefined ? "not available" : `${a.toFixed(1)} A`);
const fmtV = (v: number | undefined) => (v === undefined ? "not available" : `${v.toFixed(0)} V`);
const fmtKa = (a: number | undefined) =>
  a === undefined ? "not available" : `${(a / 1000).toFixed(2)} kA`;

function EnclosureRail({ partId, part }: { partId: string; part: Part }) {
  const project = useProject((s) => s.project);
  const din = partsOf("din-device");
  const [pick, setPick] = useState(din[0]?.id ?? "");
  if (!isCategory(part, "enclosure")) return null;
  const { rows, modulesPerRow } = part.enclosure;
  const occ = railOccupancy(project, partId, rows, modulesPerRow);
  const mounted = project.parts.filter((p) => p.mount?.enclosureId === partId);
  const free = occ.flat().filter((x) => !x).length;
  return (
    <Section title="DIN rail">
      <div className="rail-grid" aria-label={`${free} of ${rows * modulesPerRow} slots free`}>
        {occ.map((row, r) => (
          <div key={r} className="rail-row">
            {row.map((used, s) => (
              <span key={s} className={used ? "rail-slot used" : "rail-slot"} />
            ))}
          </div>
        ))}
      </div>
      <p className="hint">
        {free} of {rows * modulesPerRow} modules free (18 mm each). Pick a device in the palette and
        click this enclosure, or add one here.
      </p>
      <Field label="Device">
        <select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="din-pick">
          {din.map((d) => (
            <option key={d.id} value={d.id}>
              {partLabel(d)}
            </option>
          ))}
        </select>
      </Field>
      <div className="insp-actions">
        <button
          type="button"
          data-testid="din-add"
          disabled={!pick}
          onClick={() => {
            if (!mountDevice(partId, pick))
              window.alert("This enclosure has no free DIN slots for that device.");
          }}
        >
          Add to rail
        </button>
      </div>
      {mounted.length > 0 && (
        <ul className="object-list" data-testid="din-mounted">
          {mounted.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => useUi.getState().select({ kind: "part", id: m.id })}
              >
                Row {m.mount!.row + 1}, slot {m.mount!.slot + 1}: {labelOf(m.catalogId)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function DeviceCheckSection({ partId }: { partId: string }) {
  const { protection } = useSceneModel();
  const d = protection.devices.get(partId);
  if (!d) return null;
  return (
    <Section title="Protection check">
      <Readout
        rows={[
          {
            label: "Circuit",
            value: d.kind === "dc" ? "DC" : d.kind === "ac" ? "AC" : "not wired yet",
            testId: "prot-kind",
          },
          { label: "Circuit voltage", value: fmtV(d.maxVoltageV) },
          { label: "Design current", value: fmtA(d.designCurrentA) },
          { label: "Device rating", value: fmtA(d.ratingA) },
          {
            label: "Available fault current",
            value: fmtKa(d.faultCurrentA),
            testId: "prot-fault",
          },
        ]}
      />
      <IssueLines issues={d.issues} testId="prot-issues" />
    </Section>
  );
}

function AtsSection({ partId }: { partId: string }) {
  const { ats } = useSceneModel();
  const outages = useUi((s) => s.outages);
  const a = ats.byId.get(partId);
  if (!a) return null;
  return (
    <Section title="Transfer switch">
      <table className="spec-table" data-testid="ats-slots">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Source</th>
            <th>Live</th>
          </tr>
        </thead>
        <tbody>
          {a.slots.map((s) => {
            const active = a.state.activeSlot === s.slot;
            return (
              <tr key={s.slot} className={active ? "row-active" : undefined}>
                <th scope="row">
                  S{s.slot + 1}
                  {active ? " ●" : ""}
                </th>
                <td>{s.sourceName}</td>
                <td>
                  {s.sourceId ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={!outages.includes(s.sourceId)}
                        onChange={() => useUi.getState().toggleOutage(s.sourceId!)}
                        data-testid={`ats-live-${s.slot}`}
                      />{" "}
                      {outages.includes(s.sourceId) ? "outage" : "on"}
                    </label>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint" data-testid="ats-active">
        {a.state.live
          ? `Load is on S${(a.state.activeSlot ?? 0) + 1} (${a.slots[a.state.activeSlot ?? 0]?.sourceName ?? "?"}).`
          : "No live source: the load side is dead."}{" "}
        Untick a source to simulate an outage; the switch transfers in priority order S1 → S
        {a.slots.length}.
      </p>
      <IssueLines issues={a.issues} />
    </Section>
  );
}

function GroundRodSection({ partId }: { partId: string }) {
  const { grounding } = useSceneModel();
  const soil = useProject((s) => s.project.earthing.soil);
  const group = grounding.rodGroups.find((g) => g.rodIds.includes(partId));
  return (
    <Section title="Grounding electrode">
      <Readout
        rows={[
          { label: "Soil", value: soil.replace(/-/g, " ") },
          {
            label: "Rods bonded together",
            value: group ? String(group.rodIds.length) : "1",
          },
          {
            label: "Resistance to earth",
            value: group ? `${group.ohm.toFixed(1)} Ω` : "not available",
            testId: "rod-ohm",
          },
        ]}
      />
      <p className="hint">
        Dwight formula for one rod, IEEE 142 factor for several rods about one rod length apart.
        Change the soil in Site &amp; code (click the roof).
      </p>
    </Section>
  );
}

/** Green/red bonding status for a part or an array. */
export function BondingStatus({ id }: { id: string }) {
  const { grounding } = useSceneModel();
  const b = grounding.bonded.get(id);
  if (b === undefined) return null;
  return (
    <p className={b ? "bond-ok" : "bond-bad"} data-testid="bond-status">
      {b ? "✓ Bonded to the grounding electrode" : "✗ Not bonded: run an EGC to the PE bar"}
    </p>
  );
}

function SwapSection({ partId, part }: { partId: string; part: Part }) {
  const opts = swapOptions(part);
  if (opts.length < 2) return null;
  const din = isDinDevice(part);
  return (
    <Section title="Swap part">
      <Field label={din ? "Replace with (same kind and width)" : "Replace with"}>
        <select
          value={part.id}
          onChange={(e) => swapPart(partId, e.target.value)}
          data-testid="swap-select"
        >
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {partLabel(o)}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

function IssueLines({
  issues,
  testId,
}: {
  issues: readonly { code: string; severity: string; message: string }[];
  testId?: string;
}) {
  if (issues.length === 0)
    return (
      <p className="bond-ok" data-testid={testId}>
        ✓ No issues
      </p>
    );
  return (
    <ul className="issue-lines" data-testid={testId}>
      {issues.map((i, k) => (
        <li key={k} className={`sev-${i.severity}`}>
          <strong>{i.code}</strong> {i.message}
        </li>
      ))}
    </ul>
  );
}
