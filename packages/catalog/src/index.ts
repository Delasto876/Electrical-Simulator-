export * from "./schema/common";
export * from "./schema/electrical";
export * from "./schema/mounting";
export * from "./schema/part";
export * from "./loader";
export { bundledCatalogRaw } from "./data/index";

import { bundledCatalogRaw } from "./data/index";
import { loadCatalog } from "./loader";

/** Validated bundled catalog. Throws if the shipped data is invalid (a test guards this). */
export function getBundledCatalog() {
  const { parts, issues } = loadCatalog(bundledCatalogRaw);
  if (issues.length > 0) {
    throw new Error(
      `bundled catalog invalid:\n${issues.map((i) => `${i.id}: ${i.message}`).join("\n")}`,
    );
  }
  return parts;
}
