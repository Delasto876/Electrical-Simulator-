/**
 * @solar-sim/engine — pure TypeScript physics and design rules.
 * No DOM, no React, no three.js (enforced by eslint).
 */
export const ENGINE_VERSION = "0.4.0";

export * from "./constants";
export * from "./units";
export { findRoot, goldenMax, interpolate } from "./math/roots";
export { lambertW } from "./math/lambertw";
export * from "./solar/sunPosition";
export * from "./pv/singleDiode";
export * from "./pv/cellTemperature";
export * from "./pv/linearModel";
export * from "./conductors/tables";
export * from "./conductors/resistance";
export * from "./conductors/voltageDrop";
export * from "./conductors/ampacity";
export * from "./profiles";
export * from "./circuit/mna";
export * from "./drc/issue";
export * from "./site/roof";
export type { V3 } from "./site/vec";
export * as vec3 from "./site/vec";
export * from "./mounting/rules";
export * from "./mounting/railCut";
export * from "./mounting/tilt";
export * from "./mounting/layout";
export * from "./mounting/placement";
export * from "./mounting/bom";
export * from "./ports/compat";
export * from "./strings/stringSizing";
export * from "./circuit/pvInput";
export * from "./drc/electrical";
export * from "./protection/ocpd";
export * from "./protection/capacity";
export * from "./grounding/groundRod";
export * from "./ats/atsLogic";
export * from "./graph/unionFind";
