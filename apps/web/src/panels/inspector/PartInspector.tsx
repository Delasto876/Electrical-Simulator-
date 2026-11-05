import { catalogById } from "../../app/catalog";
import { fmtM } from "../../lib/format";
import { deleteSelection, rotatePart, setFlag } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { Readout, Section } from "./fields";
import { Nameplate } from "./Nameplate";
import { InverterDetails } from "./InverterDetails";

/** A single placed part (inverter, battery…). */
export function PartInspector({ id }: { id: string }) {
  const part = useProject((s) => s.project.parts.find((p) => p.id === id));
  const units = useProject((s) => s.project.settings.lengthUnits);
  const cat = part ? catalogById.get(part.catalogId) : undefined;
  if (!part || !cat) return <p className="empty">Part not found.</p>;
  return (
    <div>
      <Section title="Placed part">
        <Readout
          rows={[
            {
              label: "Position (x, z)",
              value: `${fmtM(part.position[0], units)}, ${fmtM(part.position[2], units)}`,
            },
            { label: "Rotation", value: `${part.rotationYDeg}°` },
            {
              label: "Ports",
              value: `${cat.ports.length} (shown as markers; draw cables with the Cable tool, C)`,
            },
          ]}
        />
        <div className="insp-actions">
          <button type="button" onClick={() => rotatePart(id)}>
            Rotate 90° (R)
          </button>
          <button
            type="button"
            onClick={() => setFlag("part", id, "locked", !part.locked)}
            aria-pressed={part.locked}
          >
            {part.locked ? "Unlock" : "Lock"}
          </button>
          <button type="button" className="danger" disabled={part.locked} onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>
      {cat.category === "inverter" && <InverterDetails partId={id} />}
      <Nameplate part={cat} />
    </div>
  );
}
