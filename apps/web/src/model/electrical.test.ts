import { beforeEach, describe, expect, it } from "vitest";
import { stringWizard } from "@solar-sim/engine";
import { getPart } from "../app/catalog";
import { freshProject, useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import * as A from "../state/actions";
import { computeScene } from "./sceneModel";
import {
  snakeOrder,
  chunkStrings,
  stringEnds,
  internalPorts,
  connectorPairsInLoop,
} from "./strings";
import { orthogonalRoute, polylineLength } from "./routing";
import { parsePortKey, modulePortKey, partPortKey } from "./ports";

const MODULE = "generic-pv-400w-108hc";
const DEYE8K = "deye-sun-8k-sg01lp1-us";
const scene = () => computeScene(useProject.getState().project);
const codes = () => scene().issues.map((i) => i.code);

/** 2 × 6 array of 400 W modules and a Deye 8K on the ground. */
function setup() {
  useProject.getState().replace(freshProject());
  const arrayId = A.addArrayAt(MODULE, "main", 6, 3.6)!;
  A.updateArray(arrayId, { rows: 2, cols: 6 });
  const invId = A.addPartAt(DEYE8K, 8, 6);
  return { arrayId, invId };
}

beforeEach(() => useUi.getState().select(null));

describe("strings helpers", () => {
  it("snake order and chunking", () => {
    expect(snakeOrder(2, 3)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 1],
      [1, 0],
    ]);
    expect(chunkStrings(2, 3, 4)).toEqual([
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    ]);
    const s = {
      id: "s",
      name: "S",
      arrayId: "A",
      modules: [
        [0, 0],
        [0, 1],
        [0, 2],
      ] as [number, number][],
    };
    expect(stringEnds(s)).toEqual({ neg: "m|A|0|0|neg", pos: "m|A|0|2|pos" });
    expect(internalPorts(s)).toEqual(["m|A|0|0|pos", "m|A|0|1|neg", "m|A|0|1|pos", "m|A|0|2|neg"]);
    expect(connectorPairsInLoop(12)).toBe(15);
  });
  it("port keys round-trip", () => {
    expect(parsePortKey(modulePortKey("A", 1, 2, "pos"))).toEqual({
      kind: "module",
      arrayId: "A",
      row: 1,
      col: 2,
      portId: "pos",
    });
    expect(parsePortKey(partPortKey("P", "pv1a+"))).toEqual({
      kind: "part",
      partId: "P",
      portId: "pv1a+",
    });
    expect(parsePortKey("x|y")).toBeUndefined();
  });
  it("orthogonal route length", () => {
    const pts = orthogonalRoute([0, 0, 0], [1, 0, 0], [3, 2, 4], [0, -1, 0], 0.5);
    expect(polylineLength(pts)).toBeCloseTo(0.5 + 2 + 4 + 2 - 0.5 + 0.5 + 0.5, 9); // a→a1, x, z, y, b1→b
  });
});

describe("one string into an inverter (Phase 3 done-criterion)", () => {
  it("String Wizard → 1 × 12 on MPPT1; cold Voc 487.3 V against the 500 V limit; no errors", () => {
    const { arrayId, invId } = setup();
    const m = getPart("pv-module", MODULE)!;
    const inv = getPart("inverter", DEYE8K)!;
    const p = useProject.getState().project;
    const opts = stringWizard(
      { ...m.electrical },
      {
        mppts: inv.electrical.mppts.map((x) => ({
          ...x,
          maxPvVoltageV: inv.electrical.maxPvVoltageV,
          mpptMinV: inv.electrical.mpptMinV,
          mpptMaxV: inv.electrical.mpptMaxV,
          startupVoltageV: inv.electrical.startupVoltageV,
        })),
        maxPvInputPowerW: inv.electrical.maxPvInputPowerW,
        ratedAcPowerW: inv.electrical.ratedAcPowerW,
      },
      p.climate,
      1.25,
      12,
    );
    expect(opts[0]).toMatchObject({ series: 12, stringsPerMppt: [1, 0] });
    A.applyWizard(arrayId, invId, opts[0]!);
    const s = scene();
    const str = [...s.electrical.strings.values()][0]!;
    expect(str.values.vocColdV).toBeCloseTo(487.27, 1);
    expect(str.mppt).toEqual({ partId: invId, group: "mppt1" });
    expect(str.polarityOk).toBe(true);
    const mppt = s.electrical.inverters.get(invId)!.mppts[0]!;
    expect(mppt.limits.maxPvVoltageV).toBe(500);
    expect(mppt.operating!.pW).toBeGreaterThan(4500); // ~12 × 400 W minus wiring loss at STC
    expect(mppt.operating!.wiringLossW).toBeGreaterThan(0);
    // the only error is the Phase 4 grounding rule: this design has no ground rod yet
    expect(s.issues.filter((i) => i.severity === "error").map((i) => i.code)).toEqual([
      "MISSING_GROUND_ROD",
    ]);
    expect(s.electrical.cables.size).toBe(2);
    expect([...s.electrical.cables.values()].every((c) => c.vdPct! > 0 && c.vdPct! < 2)).toBe(true);
    // BOM includes PV wire metres and four MC4 halves
    expect(s.bom.find((b) => b.catalogId === "generic-pv-wire-10awg")!.unit).toBe("m");
    expect(
      s.bom.filter((b) => b.catalogId.startsWith("generic-mc4")).reduce((a, b) => a + b.qty, 0),
    ).toBe(4);
  });

  it("13 modules per string → STRING_VOC_MAX error; Jamaica's 10 °C low brings it to 501.8 V (still too high)", () => {
    const { arrayId, invId } = setup();
    A.updateArray(arrayId, { rows: 1, cols: 13 });
    A.autoString(arrayId, 13);
    const sid = useProject.getState().project.strings[0]!.id;
    expect(A.connectStringToMppt(sid, invId, "mppt1")).toBe(true);
    expect(codes()).toContain("STRING_VOC_MAX");
    A.setCodeProfile("Jamaica");
    expect(useProject.getState().project.climate).toEqual({ minAmbientC: 10, maxAmbientC: 35 });
    const v = [...scene().electrical.strings.values()][0]!.values.vocColdV;
    expect(v).toBeCloseTo(13 * 37.1 * 1.0405, 2);
    expect(codes()).toContain("STRING_VOC_MAX");
  });

  it("moving the + home run to PV1 − raises a POLARITY error", () => {
    const { arrayId, invId } = setup();
    A.autoString(arrayId, 12);
    const sid = useProject.getState().project.strings[0]!.id;
    A.connectStringToMppt(sid, invId, "mppt1");
    const plus = useProject.getState().project.cables.find((c) => c.name.endsWith("+"))!;
    A.updateCable(plus.id, { to: partPortKey(invId, "pv1a-") });
    expect(codes()).toContain("POLARITY");
    expect(scene().issues.find((i) => i.code === "POLARITY")!.severity).toBe("error");
  });

  it("mixed-brand connector on a cable end → warning; open string → STRING_INCOMPLETE; unstrung modules → info", () => {
    const { arrayId, invId } = setup();
    expect(codes()).toContain("MODULES_UNSTRUNG");
    A.autoString(arrayId, 12);
    expect(codes()).toContain("STRING_INCOMPLETE");
    const sid = useProject.getState().project.strings[0]!.id;
    A.connectStringToMppt(sid, invId, "mppt1");
    const c = useProject.getState().project.cables[0]!;
    A.updateCable(c.id, { connectorFrom: "staubli-mc4-pv-kbt4" }); // female Stäubli on the male module lead
    expect(codes()).toContain("CONNECTOR_MIXED_BRAND");
  });

  it("battery: 51.2 V battery fits the 48 V inverter; a 12 V battery does not; reversed battery cable flagged", () => {
    const { invId } = setup();
    const bat = A.addPartAt("generic-lfp-51v2-100ah-rack", 9, 7);
    A.addCable(partPortKey(bat, "pos"), partPortKey(invId, "bat+"), "battery-terminal");
    A.addCable(partPortKey(bat, "neg"), partPortKey(invId, "bat-"), "battery-terminal");
    let s = scene();
    expect(s.electrical.inverters.get(invId)!.battery).toMatchObject({ partId: bat, ok: true });
    const cable = [...s.electrical.cables.values()][0]!;
    expect(cable.circuit).toBe("battery");
    expect(cable.designCurrentA).toBe(190);
    expect(s.issues.map((i) => i.code)).not.toContain("BATTERY_VOLTAGE");
    const small = A.addPartAt("generic-lfp-12v8-100ah", 10, 7);
    useProject.getState().commit("t", (d) => {
      d.cables[0]!.from = partPortKey(small, "pos");
      d.cables[1]!.from = partPortKey(small, "pos");
    });
    s = scene();
    expect(s.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["BATTERY_VOLTAGE", "POLARITY"]),
    );
  });

  it("deleting the inverter removes its cables; resizing the array drops strings that no longer fit", () => {
    const { arrayId, invId } = setup();
    A.autoString(arrayId, 12);
    A.connectStringToMppt(useProject.getState().project.strings[0]!.id, invId, "mppt1");
    useUi.getState().select({ kind: "part", id: invId });
    A.deleteSelection();
    expect(useProject.getState().project.cables).toEqual([]);
    A.updateArray(arrayId, { cols: 5 });
    expect(useProject.getState().project.strings).toEqual([]);
  });
});
