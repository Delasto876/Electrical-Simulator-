import { deleteSelection, updateObstruction } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { Field, NumberField, Section } from "./fields";

const KIND_LABEL = { tree: "Tree", tank: "Water tank", building: "Neighbouring building" } as const;

/** A tree, water tank or neighbouring building that can shade the array. */
export function ObstructionInspector({ id }: { id: string }) {
  const o = useProject((s) => s.project.obstructions.find((x) => x.id === id));
  if (!o) return <p className="empty">Obstruction not found.</p>;
  const set = (c: Parameters<typeof updateObstruction>[1]) => updateObstruction(id, c);
  return (
    <div data-testid="obstruction-inspector">
      <Section title={`${KIND_LABEL[o.kind]}: ${o.name}`}>
        <Field label="Name">
          <input value={o.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <NumberField
          label="Position x (east +)"
          unit="m"
          value={o.position[0]}
          step={0.5}
          onChange={(x) => set({ position: [x, 0, o.position[2]] })}
        />
        <NumberField
          label="Position z (south +)"
          unit="m"
          value={o.position[2]}
          step={0.5}
          onChange={(z) => set({ position: [o.position[0], 0, z] })}
        />
        <NumberField
          label="Height"
          unit="m"
          value={o.heightM}
          min={0.5}
          max={100}
          step={0.5}
          testId="obs-height"
          onChange={(heightM) => set({ heightM })}
        />
        <NumberField
          label={o.kind === "tree" ? "Crown diameter" : o.kind === "tank" ? "Diameter" : "Width"}
          unit="m"
          value={o.widthM}
          min={0.2}
          max={100}
          step={0.1}
          onChange={(widthM) => set({ widthM })}
        />
        {o.kind === "building" && (
          <>
            <NumberField
              label="Depth"
              unit="m"
              value={o.depthM}
              min={0.5}
              max={100}
              step={0.5}
              onChange={(depthM) => set({ depthM })}
            />
            <NumberField
              label="Rotation"
              unit="°"
              value={o.rotationYDeg}
              min={-180}
              max={180}
              step={5}
              onChange={(rotationYDeg) => set({ rotationYDeg })}
            />
          </>
        )}
        {o.kind === "tree" && (
          <>
            <NumberField
              label="Bare trunk"
              unit="m"
              value={o.trunkHeightM}
              min={0}
              max={50}
              step={0.5}
              onChange={(trunkHeightM) => set({ trunkHeightM })}
            />
            <NumberField
              label="Light through the leaves"
              unit="%"
              value={o.transmittancePct}
              min={0}
              max={100}
              onChange={(transmittancePct) => set({ transmittancePct })}
            />
          </>
        )}
        {o.kind === "tank" && (
          <NumberField
            label="Stand height"
            unit="m"
            value={o.standHeightM}
            min={0}
            max={20}
            step={0.5}
            onChange={(standHeightM) => set({ standHeightM })}
          />
        )}
        <p className="hint">
          Drag it in the scene to move it. Run the simulation to see the shading it causes (loss
          waterfall).
        </p>
        <div className="insp-actions">
          <button type="button" onClick={() => set({ locked: !o.locked })} aria-pressed={o.locked}>
            {o.locked ? "Unlock" : "Lock"}
          </button>
          <button type="button" onClick={() => set({ hidden: !o.hidden })}>
            {o.hidden ? "Show" : "Hide"}
          </button>
          <button type="button" className="danger" disabled={o.locked} onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>
    </div>
  );
}
