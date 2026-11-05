import { describe, expect, it } from "vitest";
import { catalogById } from "../app/catalog";
import { swapOptions } from "./swap";

describe("swapOptions", () => {
  it("offers DIN devices of the same kind, poles and width only", () => {
    const mcb = catalogById.get("generic-mcb-ac-2p-63a")!;
    const opts = swapOptions(mcb);
    expect(opts.map((o) => o.id)).toContain("generic-mcb-ac-2p-63a-3ka");
    expect(opts.map((o) => o.id)).toContain("generic-mcb-ac-2p-40a");
    expect(opts.every((o) => o.category === "din-device")).toBe(true);
    expect(opts.map((o) => o.id)).not.toContain("generic-mcb-ac-1p-20a");
  });
  it("keeps port-compatible items for other categories", () => {
    const fuse = catalogById.get("generic-class-t-300a")!;
    const opts = swapOptions(fuse);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => o.ports.length === fuse.ports.length)).toBe(true);
  });
});
