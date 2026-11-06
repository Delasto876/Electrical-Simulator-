/**
 * INSTALLATION & COMMISSIONING CHECKLIST — pass/fail limits printed next to
 * the tests. Edit here; the checklist builder is reports/checklist.ts.
 */

/** Insulation resistance test of PV strings (IEC 62446-1 Table 2). VERIFY */
export const INSULATION_TEST = [
  { maxSystemV: 120, testV: 250, minMohm: 0.5 },
  { maxSystemV: 500, testV: 500, minMohm: 1 },
  { maxSystemV: 1000, testV: 1000, minMohm: 1 },
  { maxSystemV: 1500, testV: 1500, minMohm: 1 },
] as const;

/** Open-circuit voltage measured vs expected: accepted deviation after temperature correction [%]. VERIFY (common commissioning practice, IEC 62446-1 suggests ±5 %) */
export const VOC_TOLERANCE_PCT = 5;

/** Strings in parallel on one MPPT: largest accepted Voc spread between strings [%]. VERIFY */
export const VOC_MATCH_PCT = 2;
