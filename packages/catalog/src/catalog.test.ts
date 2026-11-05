import { describe, expect, it } from "vitest";
import { bundledCatalogRaw, exportCatalog, getBundledCatalog, loadCatalog, Part } from "./index";

describe("bundled catalog", () => {
  it("validates with no issues", () => {
    const { issues } = loadCatalog(bundledCatalogRaw);
    expect(issues).toEqual([]);
  });

  it("ships only unverified placeholder data", () => {
    for (const part of getBundledCatalog()) {
      expect(part.verified, part.id).toBe(false);
    }
  });

  it("covers the three electrical categories", () => {
    const cats = new Set(getBundledCatalog().map((p) => p.category));
    expect(cats).toEqual(new Set(["pv-module", "inverter", "battery"]));
  });

  it("round-trips through export", () => {
    const parts = getBundledCatalog();
    const again = loadCatalog(JSON.parse(exportCatalog(parts)));
    expect(again.issues).toEqual([]);
    expect(again.parts).toEqual(parts);
  });
});

describe("loadCatalog", () => {
  const module = JSON.parse(JSON.stringify(bundledCatalogRaw[0])) as Record<string, unknown>;

  it("rejects a non-array", () => {
    expect(loadCatalog({}).issues[0]?.message).toMatch(/array/);
  });

  it("reports an invalid entry but keeps the valid ones", () => {
    const bad = { ...module, id: "bad-one", weightKg: -1 };
    const { parts, issues } = loadCatalog([module, bad]);
    expect(parts).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ index: 1, id: "bad-one" });
  });

  it("reports duplicate ids", () => {
    const { parts, issues } = loadCatalog([module, module]);
    expect(parts).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/duplicate/);
  });

  it("defaults verified to false when omitted", () => {
    const { verified: _v, ...rest } = module;
    const parsed = Part.parse(rest);
    expect(parsed.verified).toBe(false);
  });

  it("rejects an id that is not kebab-case", () => {
    expect(Part.safeParse({ ...module, id: "Has Spaces" }).success).toBe(false);
  });

  it("rejects an unknown port type", () => {
    const ports = [{ id: "x", type: "banana", position: [0, 0, 0], direction: [1, 0, 0] }];
    expect(Part.safeParse({ ...module, ports }).success).toBe(false);
  });

  it("accepts a generic part with attributes", () => {
    const rail = {
      id: "generic-rail-std-4200",
      category: "rail",
      brand: "Generic",
      model: "Standard rail 4.2 m",
      dimensions: { lengthMm: 4200, widthMm: 40, heightMm: 40 },
      weightKg: 3.4,
      attributes: { profile: "standard" },
    };
    const parsed = Part.parse(rail);
    expect(parsed.category).toBe("rail");
  });
});
