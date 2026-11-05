import { describe, expect, it } from "vitest";
import { ISSUE_CODES, issue, sortIssues } from "./issue";

describe("issues", () => {
  it("sorts errors first, then warnings, then info", () => {
    const list = [
      issue("info", "ROOF_LOAD", "", [], ""),
      issue("error", "LEG_RANGE", "", [], ""),
      issue("warning", "RAIL_SPAN", "", [], ""),
    ];
    expect(sortIssues(list).map((i) => i.severity)).toEqual(["error", "warning", "info"]);
  });
  it("every code has a title and an explanation", () => {
    for (const [code, v] of Object.entries(ISSUE_CODES)) {
      expect(v.title.length, code).toBeGreaterThan(5);
      expect(v.explain.length, code).toBeGreaterThan(10);
    }
  });
});
