import type { Inverter, PvModule } from "@solar-sim/catalog";
import { stringWizard, type CodeProfile, type WizardOption } from "@solar-sim/engine";
import { moduleFit } from "../app/pvModels";
import type { Climate } from "../project/projectFile";
import { mpptLimits, stringModule } from "./electricalModel";

/** String Wizard options for `module` on `inverter` at the project's design temperatures. */
export function wizardOptions(
  module: PvModule,
  inverter: Inverter,
  climate: Climate,
  profile: CodeProfile,
  availableModules: number,
): WizardOption[] {
  const fit = moduleFit(module);
  return stringWizard(
    stringModule(module),
    {
      mppts: inverter.electrical.mppts.map((_, i) => mpptLimits(inverter, i)),
      maxPvInputPowerW: inverter.electrical.maxPvInputPowerW,
      ratedAcPowerW: inverter.electrical.ratedAcPowerW,
    },
    climate,
    profile.mpptIscMultiplier,
    availableModules,
    fit.ok ? fit.params : undefined,
  );
}
