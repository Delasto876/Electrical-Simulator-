import { describe, expect, it } from "vitest";
import { loadDropInParts } from "./dropIn";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const json = (id: string, extra = {}) =>
  JSON.stringify({
    id,
    template: "din-breaker",
    name: id,
    dimsMm: { w: 18, h: 90, d: 65 },
    specs: { poles: 1, modules: 1, ratedCurrentA: 16 },
    images: { front: "front.png" },
    ...extra,
  });

describe("drop-in parts folder", () => {
  it("loads folders with their photos, skips _templates, and reports bad ones without stopping", () => {
    const base = "../../../../../assets/user-parts";
    const out = loadDropInParts(
      {
        [`${base}/user-a/part.json`]: json("user-a"),
        [`${base}/_sample/part.json`]: json("user-sample"),
        [`${base}/user-bad/part.json`]: "{ nope",
        [`${base}/user-b/part.json`]: json("user-b", { dimsMm: { w: -1, h: 1, d: 1 } }),
      },
      { [`${base}/user-a/front.png`]: PNG },
    );
    expect(out.parts.map((p) => p.id)).toEqual(["user-a"]);
    expect(out.parts[0]!.images.front).toBe(PNG);
    expect(out.parts[0]).toMatchObject({ source: "user-upload", verified: "user" });
    expect(out.problems).toHaveLength(2);
    expect(out.problems.join(" ")).toContain("user-bad");
    expect(out.problems.join(" ")).toContain("user-b");
  });

  it("the sample in assets/user-parts/_sample is a valid part (so the README example works)", async () => {
    const sample = (await import("../../../../../assets/user-parts/_sample/part.json?raw")).default;
    const { partFromJson } = await import("../model/customPackage");
    const p = partFromJson(sample, () => undefined);
    expect(p).toMatchObject({ template: "din-breaker", dimsMm: { w: 18 } });
    expect(p.terminals).toHaveLength(2);
  });
});
