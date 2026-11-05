import { useSceneModel } from "../../scene/useSceneModel";
import { useUi } from "../../state/uiStore";
import { Readout, Section } from "./fields";

/** MPPT table, DC/AC ratio and battery link for a placed inverter / charge controller. */
export function InverterDetails({ partId }: { partId: string }) {
  const { electrical } = useSceneModel();
  const inv = electrical.inverters.get(partId);
  if (!inv) return null;
  const e = inv.part.electrical;
  return (
    <Section title="PV inputs">
      <table className="spec-table" data-testid="mppt-table">
        <thead>
          <tr>
            <th>MPPT</th>
            <th>Strings</th>
            <th>Cold Voc / limit</th>
            <th>Operating (STC)</th>
          </tr>
        </thead>
        <tbody>
          {inv.mppts.map((m) => {
            const voc = Math.max(0, ...m.strings.map((s) => s.values.vocColdV));
            return (
              <tr key={m.group}>
                <th scope="row">{m.index + 1}</th>
                <td>
                  {m.strings.length === 0
                    ? "—"
                    : m.strings.map((s) => (
                        <button
                          key={s.string.id}
                          type="button"
                          className="link"
                          onClick={() =>
                            useUi.getState().select({ kind: "string", id: s.string.id })
                          }
                        >
                          {s.string.name}
                        </button>
                      ))}
                </td>
                <td>
                  {m.strings.length
                    ? `${voc.toFixed(1)} / ${m.limits.maxPvVoltageV} V ${voc <= m.limits.maxPvVoltageV ? "✓" : "✗"}`
                    : `— / ${m.limits.maxPvVoltageV} V`}
                </td>
                <td>
                  {m.operating
                    ? `${m.operating.vV.toFixed(0)} V · ${m.operating.iA.toFixed(1)} A · ${(m.operating.pW / 1000).toFixed(2)} kW`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Readout
        rows={[
          {
            label: "MPPT window / start-up",
            value: `${e.mpptMinV}–${e.mpptMaxV} V / ${e.startupVoltageV} V`,
          },
          {
            label: "PV connected (STC)",
            value: `${(inv.dcPowerW / 1000).toFixed(2)} kWp of ${(e.maxPvInputPowerW / 1000).toFixed(1)} kW max`,
          },
          {
            label: "DC/AC ratio",
            value: inv.dcAcRatio !== undefined ? inv.dcAcRatio.toFixed(2) : "— (charge controller)",
          },
          {
            label: "AC output",
            value: e.acOutput
              ? `${e.acOutput.lineToNeutralV ? `${e.acOutput.lineToNeutralV}/` : ""}${e.acOutput.voltageV} V ${e.acOutput.system} ${e.acOutput.frequencyHz} Hz`
              : "none (DC charge controller)",
          },
          {
            label: "Battery",
            value: e.battery
              ? inv.battery
                ? `${inv.battery.part.model} ${inv.battery.ok ? "✓" : "✗ voltage mismatch"}`
                : `not connected (${e.battery.minV}–${e.battery.maxV} V input)`
              : "no battery input (grid-tie)",
          },
        ]}
      />
    </Section>
  );
}
