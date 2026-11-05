import { describe, expect, it } from "vitest";
import {
  bundledCatalogRaw,
  exportCatalog,
  getBundledCatalog,
  isCategory,
  loadCatalog,
  Part,
  TYPED_CATEGORIES,
} from "./index";

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

  it("has entries for every typed category", () => {
    const cats = new Set(getBundledCatalog().map((p) => p.category));
    for (const c of TYPED_CATEGORIES) expect(cats.has(c), c).toBe(true);
  });

  it("offers PV modules from 100 W to 600 W+", () => {
    const watts = getBundledCatalog()
      .filter((p) => isCategory(p, "pv-module"))
      .map((p) => (isCategory(p, "pv-module") ? p.electrical.pmaxW : 0));
    expect(Math.min(...watts)).toBeLessThanOrEqual(100);
    expect(Math.max(...watts)).toBeGreaterThanOrEqual(600);
  });

  it("has an end and a mid clamp for every module frame thickness", () => {
    const parts = getBundledCatalog();
    const clamps = parts.filter((p) => isCategory(p, "module-clamp"));
    for (const m of parts) {
      if (!isCategory(m, "pv-module")) continue;
      for (const kind of ["end", "mid"]) {
        const ok = clamps.some(
          (c) =>
            isCategory(c, "module-clamp") &&
            c.mounting.kind === kind &&
            c.mounting.frameThicknessMm === m.mechanical.frameThicknessMm,
        );
        expect(ok, `${kind} clamp for ${m.id}`).toBe(true);
      }
    }
  });

  it("tilt-leg ranges and rail stock lengths are sane", () => {
    for (const p of getBundledCatalog()) {
      if (isCategory(p, "tilt-leg"))
        expect(p.mounting.maxLengthMm).toBeGreaterThan(p.mounting.minLengthMm);
      if (isCategory(p, "rail"))
        expect(p.mounting.maxCantileverMm).toBeLessThan(p.mounting.maxSpanMm);
    }
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
    const tie = {
      id: "generic-cable-tie-uv",
      category: "cable-management",
      brand: "Generic",
      model: "UV cable tie 200 mm",
      dimensions: { lengthMm: 200, widthMm: 4.8, heightMm: 1.2 },
      weightKg: 0.001,
      attributes: { uvRated: true },
    };
    const parsed = Part.parse(tie);
    expect(parsed.category).toBe("cable-management");
  });
});

describe("typed mounting schemas", () => {
  it("rejects a rail without its mounting block", () => {
    const rail = getBundledCatalog().find((p) => p.category === "rail")!;
    const { mounting: _m, ...rest } = rail as typeof rail & { mounting: unknown };
    expect(Part.safeParse(rest).success).toBe(false);
  });
});

describe("raceway catalog", () => {
  const cat = loadCatalog(bundledCatalogRaw);
  it("has PVC 40/80 in 1/2–6 in, FMC/LFMC in 3/8–4 in, LFNC-B in 3/8–2 in", () => {
    const sizes = (kind: string) =>
      cat.parts.flatMap((p) =>
        isCategory(p, "conduit") && p.conduit.kind === kind ? [p.conduit.tradeSize] : [],
      );
    expect(sizes("pvc-sch40")).toHaveLength(12);
    expect(sizes("pvc-sch80")).toEqual(sizes("pvc-sch40"));
    expect(sizes("fmc")[0]).toBe("3/8");
    expect(sizes("fmc").at(-1)).toBe("4");
    expect(sizes("lfmc")).toHaveLength(11);
    expect(sizes("lfnc-b").at(-1)).toBe("2");
  });
  it("internal area = π/4 · ID² and Schedule 80 is smaller inside than 40", () => {
    for (const p of cat.parts) {
      if (!isCategory(p, "conduit")) continue;
      const c = p.conduit;
      expect(c.internalAreaIn2).toBeCloseTo((Math.PI / 4) * c.internalDiameterIn ** 2, 2);
      expect(c.outsideDiameterIn).toBeGreaterThan(c.internalDiameterIn);
    }
    const area = (id: string) => {
      const p = cat.parts.find((x) => x.id === id);
      return p && isCategory(p, "conduit") ? p.conduit.internalAreaIn2 : NaN;
    };
    expect(area("pvc-sch40-1in")).toBeCloseTo(0.832, 3);
    expect(area("pvc-sch80-1in")).toBeLessThan(area("pvc-sch40-1in"));
  });
});
