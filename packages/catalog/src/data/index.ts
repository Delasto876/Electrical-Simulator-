import batteries from "./batteries.json";
import fasteners from "./fasteners.json";
import inverters from "./inverters.json";
import moduleClamps from "./module-clamps.json";
import pvModules from "./pv-modules.json";
import railSplices from "./rail-splices.json";
import rails from "./rails.json";
import roofAttachments from "./roof-attachments.json";
import tiltLegs from "./tilt-legs.json";

/**
 * Raw (unvalidated) bundled catalog: one JSON file per category in this
 * folder. To add a category file, import it here and add it to the list.
 * Every entry is a generic, representative placeholder flagged
 * `verified: false`. Use loadCatalog() to validate.
 */
export const bundledCatalogRaw: unknown[] = [
  ...pvModules,
  ...inverters,
  ...batteries,
  ...rails,
  ...railSplices,
  ...roofAttachments,
  ...moduleClamps,
  ...tiltLegs,
  ...fasteners,
];
