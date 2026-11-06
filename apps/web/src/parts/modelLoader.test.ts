import { describe, expect, it } from "vitest";
import { base64ToBytes, modelFileUrl } from "./modelLoader";

describe("model loader", () => {
  it("decodes base64 model text to the original bytes", () => {
    expect([...base64ToBytes("Z2xURg==\n")]).toEqual([0x67, 0x6c, 0x54, 0x46]); // "glTF"
  });
  it("uses the glb itself in normal builds", () => {
    expect(modelFileUrl("x.glb")).toMatch(/models\/x\.glb$/);
  });
});
