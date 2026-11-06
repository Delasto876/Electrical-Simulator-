import { loadPowerW } from "@solar-sim/engine";
import { setLoadProfile } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { loadProfileOf } from "../../model/simModel";
import { NumberField, Section, SelectField } from "./fields";

/** How a load is used through the day (feeds the energy simulation). */
export function LoadProfileEditor({ partId, ratedW }: { partId: string; ratedW: number }) {
  const project = useProject((s) => s.project);
  const prof = loadProfileOf(project, partId);
  const custom = !!project.simulation.loadProfiles[partId];
  const daily =
    Array.from({ length: 24 }, (_, h) => loadPowerW(ratedW, prof, h + 0.5)).reduce(
      (a, b) => a + b,
      0,
    ) / 1000;
  return (
    <Section title="Daily use (simulation)">
      <SelectField
        label="In use"
        value={prof.kind}
        testId="load-kind"
        options={[
          { value: "always", label: "All day" },
          { value: "window", label: "Between set hours" },
        ]}
        onChange={(kind) =>
          setLoadProfile(
            partId,
            kind === "always"
              ? { kind: "always", dutyPct: prof.dutyPct }
              : { kind: "window", startH: 18, endH: 23, dutyPct: prof.dutyPct },
          )
        }
      />
      {prof.kind === "window" && (
        <>
          <NumberField
            label="From"
            unit="h"
            value={prof.startH}
            min={0}
            max={24}
            onChange={(startH) => setLoadProfile(partId, { ...prof, startH })}
          />
          <NumberField
            label="To"
            unit="h"
            value={prof.endH}
            min={0}
            max={24}
            onChange={(endH) => setLoadProfile(partId, { ...prof, endH })}
          />
        </>
      )}
      <NumberField
        label="Running (duty cycle)"
        unit="%"
        value={prof.dutyPct}
        min={0}
        max={100}
        testId="load-duty"
        onChange={(dutyPct) => setLoadProfile(partId, { ...prof, dutyPct })}
      />
      <p className="hint" data-testid="load-daily">
        ≈ {daily.toFixed(2)} kWh per day{custom ? "" : " (default for this load)"}.
        {custom && (
          <>
            {" "}
            <button type="button" className="link" onClick={() => setLoadProfile(partId, null)}>
              Reset
            </button>
          </>
        )}
      </p>
    </Section>
  );
}
