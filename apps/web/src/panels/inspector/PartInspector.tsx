import { catalogById, partLabel } from "../../app/catalog";
import { frameSelection } from "../../app/focus";
import { fmtM } from "../../lib/format";
import { deleteSelection, rotatePart, setFlag } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { Readout, Section } from "./fields";
import { Nameplate } from "./Nameplate";
import { InverterDetails } from "./InverterDetails";
import { ProtectionDetails } from "./ProtectionDetails";
import { LoadProfileEditor } from "./LoadProfileEditor";

/** A single placed part (inverter, battery…). */
export function PartInspector({ id }: { id: string }) {
  const part = useProject((s) => s.project.parts.find((p) => p.id === id));
  const units = useProject((s) => s.project.settings.lengthUnits);
  const enclosure = useProject((s) =>
    part?.mount ? s.project.parts.find((p) => p.id === part.mount!.enclosureId) : undefined,
  );
  const cat = part ? catalogById.get(part.catalogId) : undefined;
  if (!part || !cat) return <p className="empty">Part not found.</p>;
  const encName = enclosure
    ? (() => {
        const e = catalogById.get(enclosure.catalogId);
        return e ? partLabel(e) : enclosure.id;
      })()
    : "";
  return (
    <div>
      <Section title="Placed part">
        <Readout
          rows={[
            part.mount
              ? {
                  label: "Mounted in",
                  value: `${encName}, row ${part.mount.row + 1}, slot ${part.mount.slot + 1}`,
                  testId: "mounted-in",
                }
              : {
                  label: "Position (x, z)",
                  value: `${fmtM(part.position[0], units)}, ${fmtM(part.position[2], units)}`,
                },
            ...(part.mount ? [] : [{ label: "Rotation", value: `${part.rotationYDeg}°` }]),
            {
              label: "Ports",
              value: `${cat.ports.length} (shown as markers; draw cables with the Cable tool, C)`,
            },
          ]}
        />
        <div className="insp-actions">
          <button type="button" disabled={!!part.mount} onClick={() => rotatePart(id)}>
            Rotate 90° (R)
          </button>
          <button type="button" onClick={frameSelection} title="Zoom the camera to this part (F)">
            Frame (F)
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
      <ProtectionDetails partId={id} part={cat} />
      {cat.category === "load" && "load" in cat && (
        <LoadProfileEditor partId={id} ratedW={(cat as { load: { powerW: number } }).load.powerW} />
      )}
      <Nameplate part={cat} />
    </div>
  );
}
