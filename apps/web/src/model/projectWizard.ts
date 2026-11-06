import { DEFAULT_CODE_PROFILE, getCodeProfile, type RoofSpec } from "@solar-sim/engine";
import { DEFAULT_SIMULATION } from "../config/defaults";
import { newProject, type ProjectFile, type ReportInfo } from "../project/projectFile";
import { autoDesign, type AutoDesignInput, type AutoDesignResult } from "./autoDesign";

/**
 * NEW-PROJECT WIZARD answers → project. Steps: job, site & code, roof,
 * system. "empty" starts with the roof only; the other system types run the
 * auto-designer.
 */
export interface WizardAnswers {
  name: string;
  report: ReportInfo;
  site: ProjectFile["site"];
  codeProfileId: string;
  lengthUnits: ProjectFile["settings"]["lengthUnits"];
  roof: RoofSpec;
  system: AutoDesignInput["system"] | "empty";
  design: Omit<AutoDesignInput, "system">;
}

export function wizardProject(
  a: WizardAnswers,
  now: Date = new Date(),
  id?: string,
): { project: ProjectFile; design: AutoDesignResult | undefined } {
  const profile = getCodeProfile(a.codeProfileId) ?? DEFAULT_CODE_PROFILE;
  const p = newProject(
    {
      name: a.name.trim() || "Untitled project",
      codeProfileId: profile.id,
      climate: { ...profile.climateDefaults },
      roof: { ...a.roof },
      lengthUnits: a.lengthUnits,
      wireUnits: "awg",
      site: { ...a.site },
      simulation: DEFAULT_SIMULATION,
    },
    now,
    id,
  );
  p.report = { ...a.report };
  if (a.system === "empty") return { project: p, design: undefined };
  const design = autoDesign(p, { ...a.design, system: a.system });
  return { project: design.project, design };
}
