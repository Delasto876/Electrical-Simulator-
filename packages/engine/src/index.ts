/**
 * @solar-sim/engine — pure TypeScript physics and design rules.
 * No DOM, no React, no three.js (enforced by eslint).
 */
export const ENGINE_VERSION = "0.1.0";

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
