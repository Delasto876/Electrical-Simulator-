import { describe, expect, it } from "vitest";
import { priceBom } from "./bomPricing";

describe("priceBom", () => {
  it("prices per-metre rails by stock length and counts unpriced lines", () => {
    const r = priceBom([
      { catalogId: "generic-rail-standard", variant: "3600 mm stock", qty: 2, unit: "piece" },
      { catalogId: "generic-end-clamp-30", qty: 4, unit: "each" },
      { catalogId: "not-in-catalog", qty: 1, unit: "each" },
    ]);
    expect(r.lines[0]!.unitPrice).toBeCloseTo(8 * 3.6, 9); // 8 USD/m × 3.6 m
    expect(r.lines[1]!.lineTotal).toBeCloseTo(4 * 1.4, 9);
    expect(r.unpriced).toBe(1);
    expect(r.total).toBeCloseTo(2 * 28.8 + 5.6, 9);
    expect(r.currency).toBe("USD");
  });
});
