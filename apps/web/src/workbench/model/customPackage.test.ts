import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  checkDraft,
  draftToPart,
  emptyDraft,
  exportPartPack,
  importPartPack,
  newPartId,
  partFromJson,
  partToFiles,
} from "./customPackage";
import { partInfo } from "./partInfo";
import { useCustomParts } from "../state/customParts";

// a 1×1 PNG
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function breaker() {
  const d = emptyDraft("din-breaker");
  d.name = "Acme 20 A MCB";
  d.images = { front: PNG };
  return d;
}

describe("custom part drafts", () => {
  it("accepts a complete DIN breaker and rejects missing numbers with a reason", () => {
    expect(checkDraft(breaker()).errors).toEqual([]);
    const bad = breaker();
    bad.name = " ";
    bad.specs.ratedCurrentA = 0;
    bad.dimsMm.h = 0;
    const e = checkDraft(bad).errors.join(" ");
    expect(e).toContain("name");
    expect(e).toContain("Rated current");
    expect(e).toContain("height");
  });
  it("warns when the width does not match the module count, and about single photos", () => {
    const d = breaker();
    d.specs.modules = 2;
    const w = checkDraft(d).warnings.join(" ");
    expect(w).toContain("36 mm");
    expect(w).toContain("Only one photo");
    expect(checkDraft(emptyDraft("din-breaker")).warnings.join(" ")).toContain("No front photo");
  });
  it("makes unique ids and a part marked user-upload / user-verified", () => {
    expect(newPartId("Acme 20 A MCB!", new Set())).toBe("user-acme-20-a-mcb");
    expect(newPartId("Acme 20 A MCB!", new Set(["user-acme-20-a-mcb"]))).toBe(
      "user-acme-20-a-mcb-2",
    );
    const p = draftToPart(breaker(), new Set());
    expect(p).toMatchObject({ source: "user-upload", verified: "user", approximate: true });
    expect(() => draftToPart(emptyDraft("din-breaker"), new Set())).toThrow(/name/);
  });
});

describe("part packs", () => {
  it("round-trips a part through a .partpack zip with its photo", () => {
    const p = draftToPart(breaker(), new Set());
    const out = importPartPack(exportPartPack([p]));
    expect(out.problems).toEqual([]);
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0]).toMatchObject({
      id: p.id,
      name: p.name,
      dimsMm: p.dimsMm,
      specs: p.specs,
    });
    expect(out.parts[0]!.images.front).toBe(PNG);
  });
  it("lists the folder layout assets/user-parts/<id>/part.json + photos", () => {
    const p = draftToPart(breaker(), new Set());
    expect(Object.keys(partToFiles(p)).sort()).toEqual([`${p.id}/front.png`, `${p.id}/part.json`]);
  });
  it("reports a bad part and still loads the good ones; rejects non-zips", () => {
    const good = draftToPart(breaker(), new Set());
    const files = {
      ...partToFiles(good),
      "broken/part.json": strToU8('{"id":"Bad Id","template":"nope"}'),
    };
    const out = importPartPack(zipSync(files));
    expect(out.parts.map((x) => x.id)).toEqual([good.id]);
    expect(out.problems[0]).toContain("broken/part.json");
    expect(() => importPartPack(new Uint8Array([1, 2, 3]))).toThrow(/not a part pack/);
    expect(importPartPack(zipSync({ "readme.txt": strToU8("x") })).problems[0]).toContain(
      "no part.json",
    );
  });
  it("a part.json with a missing photo file still loads, without that photo", () => {
    const p = partFromJson(
      JSON.stringify({
        id: "sample",
        template: "din-breaker",
        name: "Sample",
        dimsMm: { w: 18, h: 90, d: 65 },
        images: { front: "front.png" },
      }),
      () => undefined,
    );
    expect(p.images).toEqual({});
    expect(p.specs).toEqual({});
  });
});

describe("custom parts in the workbench", () => {
  it("a custom breaker is a DIN device with its module count and a custom enclosure has rows", () => {
    const b = draftToPart(
      { ...breaker(), specs: { ...breaker().specs, modules: 2, poles: 2 } },
      new Set(),
    );
    useCustomParts.getState().add(b);
    expect(partInfo(b.id)).toMatchObject({
      source: "custom",
      dinModules: 2,
      category: "din-device",
      placeable: true,
    });
    const e = emptyDraft("din-enclosure");
    e.name = "My box";
    const enc = draftToPart({ ...e, specs: { ...e.specs, modulesPerRow: 8, rows: 2 } }, new Set());
    useCustomParts.getState().add(enc);
    expect(partInfo(enc.id)?.enclosure).toEqual({ modulesPerRow: 8, rows: 2 });
    useCustomParts.getState().remove(b.id);
    useCustomParts.getState().remove(enc.id);
  });
});
