import { ROOF_TYPES, type RoofType } from "@solar-sim/engine";
import { updateRoof } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { COVERING_INFO, ROOF_TYPE_INFO } from "../../roofs/registry";
import { catalogById } from "../../app/catalog";
import { useUi } from "../../state/uiStore";
import { CODE_PROFILES, getCodeProfile, SOIL_RESISTIVITY_OHM_M } from "@solar-sim/engine";
import { setClimate, setCodeProfile, setSoil } from "../../state/actions";
import { SOIL_TYPES } from "../../project/projectFile";
import { NumberField, Section, SelectField } from "./fields";

export function RoofInspector() {
  const roof = useProject((s) => s.project.roof);
  const info = ROOF_TYPE_INFO[roof.type];
  return (
    <>
      <SceneObjects />
      <SiteAndCode />
      <RoofFields roof={roof} info={info} />
    </>
  );
}

/** Code profile and design temperatures (drive Voc/Vmp and ampacity checks). */
function SiteAndCode() {
  const profileId = useProject((s) => s.project.codeProfileId);
  const climate = useProject((s) => s.project.climate);
  const soil = useProject((s) => s.project.earthing.soil);
  const profile = getCodeProfile(profileId);
  return (
    <Section title="Site & code">
      <SelectField
        label="Code profile"
        value={profileId}
        testId="code-profile-select"
        options={CODE_PROFILES.map((p) => ({ value: p.id, label: p.name }))}
        onChange={setCodeProfile}
      />
      {profile && <p className="hint">{profile.caveat}</p>}
      <NumberField
        label="Design low (max Voc)"
        unit="°C"
        value={climate.minAmbientC}
        min={-60}
        max={40}
        onChange={(minAmbientC) => setClimate({ minAmbientC })}
        testId="climate-min"
      />
      <NumberField
        label="Design high (min Vmp)"
        unit="°C"
        value={climate.maxAmbientC}
        min={0}
        max={60}
        onChange={(maxAmbientC) => setClimate({ maxAmbientC })}
      />
      <SelectField
        label="Soil at the ground rods"
        value={soil}
        testId="soil-select"
        options={SOIL_TYPES.map((t) => ({
          value: t,
          label: `${t.replace(/-/g, " ")} (${SOIL_RESISTIVITY_OHM_M[t]} Ω·m)`,
        }))}
        onChange={setSoil}
      />
    </Section>
  );
}

/** Keyboard/screen-reader friendly way to select anything in the 3D scene. */
function SceneObjects() {
  const arrays = useProject((s) => s.project.arrays);
  const parts = useProject((s) => s.project.parts);
  const raceways = useProject((s) => s.project.raceways);
  if (arrays.length === 0 && parts.length === 0 && raceways.length === 0) return null;
  return (
    <Section title="Objects in the scene">
      <ul className="object-list">
        {arrays.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className="link"
              onClick={() => useUi.getState().select({ kind: "array", id: a.id })}
            >
              {a.name}
            </button>{" "}
            <span className="muted">
              {a.rows} × {a.cols} {a.mounting === "tilted" ? "tilted" : "flush"}
              {a.hidden ? " · hidden" : ""}
              {a.locked ? " · locked" : ""}
            </span>
          </li>
        ))}
        {parts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="link"
              data-testid={`obj-${p.id}`}
              onClick={() => useUi.getState().select({ kind: "part", id: p.id })}
            >
              {catalogById.get(p.catalogId)?.model ?? p.catalogId}
            </button>
          </li>
        ))}
        {raceways.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="link"
              data-testid={`obj-${r.id}`}
              onClick={() => useUi.getState().select({ kind: "raceway", id: r.id })}
            >
              {r.name}
            </button>{" "}
            <span className="muted">{catalogById.get(r.catalogId)?.model ?? r.catalogId}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RoofFields({
  roof,
  info,
}: {
  roof: ReturnType<typeof useProject.getState>["project"]["roof"];
  info: (typeof ROOF_TYPE_INFO)[keyof typeof ROOF_TYPE_INFO];
}) {
  return (
    <Section title="Roof / site">
      <SelectField<RoofType>
        label="Type"
        value={roof.type}
        testId="roof-type"
        options={ROOF_TYPES.map((t) => ({ value: t, label: ROOF_TYPE_INFO[t].label }))}
        onChange={(type) => {
          const next = ROOF_TYPE_INFO[type];
          updateRoof({
            type,
            pitchDeg: next.defaultPitchDeg,
            surface: next.coverings.includes(roof.surface) ? roof.surface : next.coverings[0]!,
            eaveHeightM: next.hasBuilding ? Math.max(roof.eaveHeightM, 2.5) : 0,
          });
        }}
      />
      <SelectField
        label="Covering"
        value={roof.surface}
        testId="roof-covering"
        options={info.coverings.map((c) => ({ value: c, label: COVERING_INFO[c]?.label ?? c }))}
        onChange={(surface) => updateRoof({ surface })}
      />
      <NumberField
        label="Width along eave"
        unit="m"
        value={roof.widthM}
        step={0.1}
        min={1}
        max={100}
        onChange={(widthM) => updateRoof({ widthM })}
      />
      <NumberField
        label="Depth"
        unit="m"
        value={roof.depthM}
        step={0.1}
        min={1}
        max={100}
        onChange={(depthM) => updateRoof({ depthM })}
      />
      {(roof.type === "mono-pitch" || roof.type === "gable") && (
        <NumberField
          label="Pitch"
          unit="°"
          value={roof.pitchDeg}
          step={1}
          min={1}
          max={60}
          onChange={(pitchDeg) => updateRoof({ pitchDeg })}
        />
      )}
      <NumberField
        label="Facing azimuth (180 = south)"
        unit="°"
        value={roof.azimuthDeg}
        step={5}
        min={0}
        max={359}
        onChange={(azimuthDeg) => updateRoof({ azimuthDeg })}
      />
      {info.hasBuilding && (
        <NumberField
          label="Eave height"
          unit="m"
          value={roof.eaveHeightM}
          step={0.1}
          min={0}
          max={30}
          onChange={(eaveHeightM) => updateRoof({ eaveHeightM })}
        />
      )}
    </Section>
  );
}
