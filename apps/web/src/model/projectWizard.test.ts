import { describe, expect, it } from "vitest";
import { AUTO_DESIGN, DEFAULT_SITE, NEW_PROJECT_ROOF } from "../config/defaults";
import { EMPTY_REPORT_INFO } from "../project/projectFile";
import { wizardProject, type WizardAnswers } from "./projectWizard";

const answers = (system: WizardAnswers["system"]): WizardAnswers => ({
  name: "Smith residence",
  report: { ...EMPTY_REPORT_INFO, clientName: "J. Smith", reference: "LT-1" },
  site: DEFAULT_SITE,
  codeProfileId: "Jamaica",
  lengthUnits: "imperial",
  roof: { ...NEW_PROJECT_ROOF, widthM: 14 },
  system,
  design: { targetKwp: 4, moduleId: "generic-pv-450w-144hc", loads: AUTO_DESIGN.defaultLoads },
});

describe("new-project wizard", () => {
  it("empty: name, client, profile, units and roof only", () => {
    const { project, design } = wizardProject(
      answers("empty"),
      new Date("2026-01-01T00:00:00Z"),
      "w1",
    );
    expect(design).toBeUndefined();
    expect(project.meta.name).toBe("Smith residence");
    expect(project.report.clientName).toBe("J. Smith");
    expect(project.codeProfileId).toBe("Jamaica");
    expect(project.settings.lengthUnits).toBe("imperial");
    expect(project.roof.widthM).toBe(14);
    expect(project.arrays).toEqual([]);
  });

  it("hybrid: runs the auto-designer and keeps the job details", () => {
    const { project, design } = wizardProject(answers("hybrid"));
    expect(design!.inverter.electrical.kind).toBe("hybrid");
    expect(project.report.reference).toBe("LT-1");
    expect(project.arrays).toHaveLength(1);
    expect(design!.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
