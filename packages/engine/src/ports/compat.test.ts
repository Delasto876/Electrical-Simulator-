import { describe, expect, it } from "vitest";
import { canConnect } from "./compat";

describe("canConnect", () => {
  it("MC4 needs opposite genders", () => {
    expect(canConnect({ type: "mc4", gender: "male" }, { type: "mc4", gender: "female" }).ok).toBe(
      true,
    );
    const mm = canConnect({ type: "mc4", gender: "male" }, { type: "mc4", gender: "male" });
    expect(mm.ok).toBe(false);
    expect(mm.reason).toMatch(/male-to-male/);
    expect(canConnect({ type: "mc4" }, { type: "mc4", gender: "female" }).ok).toBe(false);
  });
  it("only compatible types mate", () => {
    expect(canConnect({ type: "rail-slot" }, { type: "clamp-seat" }).ok).toBe(true);
    expect(canConnect({ type: "dc-lug" }, { type: "battery-terminal" }).ok).toBe(true);
    expect(canConnect({ type: "mc4", gender: "male" }, { type: "ac-terminal" }).ok).toBe(false);
    expect(canConnect({ type: "unknown" }, { type: "mc4" }).ok).toBe(false);
  });
});
