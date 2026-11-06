import { describe, expect, it } from "vitest";
import { evalLength, formatLength, lengthFieldValue, parseLength } from "./units";

describe("length formatting", () => {
  it("shows a length in every unit", () => {
    expect(formatLength(0.6, "mm")).toBe("600 mm");
    expect(formatLength(0.6, "cm")).toBe("60.0 cm");
    expect(formatLength(8, "m")).toBe("8.00 m");
    expect(formatLength(0.0254 * 10, "in")).toBe("10.0 in");
    expect(formatLength(0.3048 * 2 + 0.0254 * 6.5, "ft-in")).toBe("2′ 6 1/2″");
    expect(formatLength(0.3048, "ft-in")).toBe("1′ 0″");
    expect(formatLength(-0.0254 * 3, "ft-in")).toBe("-0′ 3″");
    expect(formatLength(Number.NaN, "mm")).toBe("—");
    expect(formatLength(0.0254 * 0.5, "ft-in")).toBe("0′ 1/2″");
  });
  it("edit-field values drop the unit text", () => {
    expect(lengthFieldValue(0.6, "mm")).toBe("600");
    expect(lengthFieldValue(0.6, "cm")).toBe("60");
    expect(lengthFieldValue(8, "m")).toBe("8");
    expect(lengthFieldValue(0.0254 * 10, "in")).toBe("10");
    expect(lengthFieldValue(0.3048 * 2 + 0.0254 * 6, "ft-in")).toBe(`2'6"`);
  });
});

describe("length parsing", () => {
  const close = (v: number | undefined, e: number) => expect(v).toBeCloseTo(e, 9);
  it("a bare number uses the default unit", () => {
    close(parseLength("600", "mm"), 0.6);
    close(parseLength("60", "cm"), 0.6);
    close(parseLength("8", "m"), 8);
    close(parseLength("10", "in"), 0.254);
    close(parseLength("2", "ft-in"), 0.6096);
  });
  it("unit suffixes override the default", () => {
    close(parseLength("0.75m", "mm"), 0.75);
    close(parseLength("75 cm", "mm"), 0.75);
    close(parseLength("750mm", "m"), 0.75);
    close(parseLength("1.5 ft", "mm"), 0.4572);
    close(parseLength('6"', "mm"), 0.1524);
    close(parseLength("6 in", "mm"), 0.1524);
  });
  it("feet and inches, with fractions", () => {
    close(parseLength(`2'6"`, "mm"), 0.762);
    close(parseLength(`2'`, "mm"), 0.6096);
    close(parseLength(`2' 6 1/2"`, "mm"), 0.3048 * 2 + 0.0254 * 6.5);
    close(parseLength("2′6″", "mm"), 0.762);
  });
  it("rejects nonsense", () => {
    expect(parseLength("", "mm")).toBeUndefined();
    expect(parseLength("abc", "mm")).toBeUndefined();
    expect(parseLength("12 parsecs", "mm")).toBeUndefined();
  });
});

describe("length expressions", () => {
  const close = (v: number | undefined, e: number) => expect(v).toBeCloseTo(e, 9);
  it("sums with the default unit, and mixes units", () => {
    close(evalLength("600+25", "mm"), 0.625);
    close(evalLength("0.75m", "mm"), 0.75);
    close(evalLength("0.75m + 25", "mm"), 0.775);
    close(evalLength("2'6\"", "mm"), 0.762);
    close(evalLength("1.5 ft", "mm"), 0.4572);
    close(evalLength("3 ft - 4 in", "mm"), 0.9144 - 0.1016);
    close(evalLength('2\' 6 1/2" + 1"', "mm"), 0.3048 * 2 + 0.0254 * 7.5);
  });
  it("multiplies and divides by plain numbers, with brackets and a minus sign", () => {
    close(evalLength("1200/2", "mm"), 0.6);
    close(evalLength("(1.2m+0.3m)*2", "mm"), 3);
    close(evalLength("-300", "mm"), -0.3);
    close(evalLength("10 in * 2", "mm"), 0.508);
    close(evalLength("50 cm", "mm"), 0.5);
  });
  it("rejects what is not a length", () => {
    for (const bad of ["", "abc", "600+", "(1+2", "5/0", "3 parsecs", "1 + + 2 x"])
      expect(evalLength(bad, "mm")).toBeUndefined();
  });
});
