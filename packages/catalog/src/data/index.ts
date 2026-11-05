import batteries from "./batteries.json";
import inverters from "./inverters.json";
import pvModules from "./pv-modules.json";

/**
 * Raw (unvalidated) bundled catalog. Every entry is a generic, representative
 * placeholder flagged `verified: false`. Use loadCatalog() to validate.
 */
export const bundledCatalogRaw: unknown[] = [...pvModules, ...inverters, ...batteries];
