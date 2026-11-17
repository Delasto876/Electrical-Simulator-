import { describe, expect, it } from "vitest";
import { traceStrings, worstStatus, type NetLink, type NetTerminal } from "./netlist";

/** n modules m1…mn with + and − leads, and an inverter with two MPPTs. */
function rig(n: number): NetTerminal[] {
  const out: NetTerminal[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({ key: `m${i}:pos`, partId: `m${i}`, polarity: "+", role: "source" });
    out.push({ key: `m${i}:neg`, partId: `m${i}`, polarity: "-", role: "source" });
    out.push({ key: `m${i}:gnd`, partId: `m${i}`, polarity: "PE", role: "other" });
  }
  for (const g of ["1", "2"]) {
    out.push({
      key: `inv:pv${g}+`,
      partId: "inv",
      polarity: "+",
      role: "input",
      group: `mppt${g}`,
    });
    out.push({
      key: `inv:pv${g}-`,
      partId: "inv",
      polarity: "-",
      role: "input",
      group: `mppt${g}`,
    });
  }
  return out;
}
const L = (a: string, b: string): NetLink => ({ a, b });
/** m1.+ → m2.− → … (series jumpers). */
const series = (from: number, to: number): NetLink[] =>
  Array.from({ length: to - from }, (_, i) => L(`m${from + i}:pos`, `m${from + i + 1}:neg`));

describe("traceStrings", () => {
  it("finds a closed 4-module string on one MPPT", () => {
    const r = traceStrings(rig(4), [
      ...series(1, 4),
      L("m4:pos", "inv:pv1+"),
      L("m1:neg", "inv:pv1-"),
    ]);
    expect(r.strings).toHaveLength(1);
    const s = r.strings[0]!;
    expect(s.id).toBe("S1");
    expect(s.moduleIds).toEqual(["m1", "m2", "m3", "m4"]);
    expect(s.status).toBe("closed");
    expect(s.input).toEqual({ partId: "inv", group: "mppt1" });
  });

  it("reports OPEN when one string end is not landed", () => {
    const r = traceStrings(rig(3), [...series(1, 3), L("m3:pos", "inv:pv1+")]);
    expect(r.strings[0]!.status).toBe("open");
    expect(r.strings[0]!.reason).toContain("−");
  });

  it("reports OPEN when a series link is missing (two strings, neither closed)", () => {
    const r = traceStrings(rig(4), [
      L("m1:pos", "m2:neg"),
      L("m3:pos", "m4:neg"),
      L("m4:pos", "inv:pv1+"),
      L("m1:neg", "inv:pv1-"),
    ]);
    expect(r.strings.map((s) => s.status)).toEqual(["open", "open"]);
  });

  it("reports REVERSED, CROSSED and SHORT", () => {
    expect(
      traceStrings(rig(2), [...series(1, 2), L("m2:pos", "inv:pv1-"), L("m1:neg", "inv:pv1+")])
        .strings[0]!.status,
    ).toBe("reversed");
    expect(
      traceStrings(rig(2), [...series(1, 2), L("m2:pos", "inv:pv1+"), L("m1:neg", "inv:pv2-")])
        .strings[0]!.status,
    ).toBe("crossed");
    expect(traceStrings(rig(2), [...series(1, 2), L("m2:pos", "m1:neg")]).strings[0]!.status).toBe(
      "short",
    );
    expect(traceStrings(rig(1), [L("m1:pos", "m1:neg")]).strings[0]!.status).toBe("short");
  });

  it("two parallel strings on one MPPT are both closed; lone modules are unstrung", () => {
    const t = rig(5);
    const r = traceStrings(t, [
      L("m1:pos", "m2:neg"),
      L("m3:pos", "m4:neg"),
      L("m2:pos", "inv:pv1+"),
      L("m4:pos", "inv:pv1+"),
      L("m1:neg", "inv:pv1-"),
      L("m3:neg", "inv:pv1-"),
    ]);
    expect(r.strings.map((s) => s.status)).toEqual(["closed", "closed"]);
    expect(r.unstrung).toEqual(["m5"]);
    expect(r.netOf("m2:pos")).toBe(r.netOf("inv:pv1+"));
  });

  it("worstStatus picks the most serious status", () => {
    expect(worstStatus(["closed", "open", "short"])).toBe("short");
    expect(worstStatus(["closed"])).toBe("closed");
    expect(worstStatus([])).toBeUndefined();
  });
});
