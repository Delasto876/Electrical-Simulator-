import { describe, expect, it } from "vitest";
import { buildExample } from "../model/examples";
import { computeScene } from "../model/sceneModel";
import { awgTag, buildSld } from "./sld";
import { drawingBounds } from "./drawing";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("single-line diagram", () => {
  const p = buildExample("hybrid", NOW);
  const sld = buildSld(p, computeScene(p));
  const node = (tag: string) => sld.nodes.find((n) => n.tag === tag)!;

  it("formats wire sizes the way electricians write them", () => {
    expect(awgTag("10")).toBe("#10");
    expect(awgTag("1/0")).toBe("#1/0");
    expect(awgTag("250")).toBe("250 kcmil");
  });

  it("puts PV and battery left of the inverter, the AC side right of it", () => {
    const inv = node("INV1");
    expect(node("S1").col).toBeLessThan(node("CMB1").col);
    expect(node("CMB1").col).toBeLessThan(node("CB1").col); // DC MCB
    expect(node("CB1").col).toBe(inv.col - 1);
    expect(node("F1").col).toBe(inv.col - 1); // Class T fuse
    expect(node("BAT1").col).toBe(inv.col - 2); // behind its fuse, not beside it
    expect(node("ATS1").col).toBe(inv.col + 2); // via the input breaker (the bare N run is dropped)
    expect(node("UT1").col).toBe(inv.col + 3);
    expect(node("GEN1").col).toBe(inv.col + 3);
    expect(node("LD1").col).toBe(inv.col + 3);
  });

  it("labels each circuit with all its conductors and marks DC vs AC", () => {
    const tagOf = (id: string) => sld.nodes.find((n) => n.id === id)!.tag;
    const edge = (x: string, y: string) =>
      sld.edges.find((e) => [tagOf(e.a), tagOf(e.b)].sort().join() === [x, y].sort().join())!;
    expect(edge("S1", "CMB1").label).toBe("(2) #10 PV");
    expect(edge("S1", "CMB1").dc).toBe(true);
    expect(edge("CB1", "INV1").label).toBe("(2) #8 PV");
    expect(edge("UT1", "ATS1").label).toBe("(3) #6 THHN");
    expect(edge("UT1", "ATS1").dc).toBe(false);
    // Battery − runs straight to the inverter; it stays in the diagram only as part of the battery line.
    expect(sld.edges.some((e) => [tagOf(e.a), tagOf(e.b)].sort().join() === "BAT1,INV1")).toBe(
      false,
    );
  });

  it("shows equipment grounding and the electrode resistance", () => {
    expect(node("INV1").ground).toEqual(["#4 EGC"]);
    expect(sld.notes[0]).toMatch(/GR1 \+ GR2: \d+ Ω/);
  });

  it("keeps every shape on the sheet", () => {
    const b = drawingBounds(sld.drawing.shapes);
    expect(b.minX).toBeGreaterThanOrEqual(0);
    expect(b.minY).toBeGreaterThanOrEqual(0);
    expect(b.maxX).toBeLessThanOrEqual(sld.drawing.width);
    expect(b.maxY).toBeLessThanOrEqual(sld.drawing.height);
  });
});
