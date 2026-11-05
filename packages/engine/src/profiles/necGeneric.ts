import { NEC_310_16_BASE_AMBIENT_C } from "../conductors/tables";
import type { CodeProfile } from "./types";

/**
 * NEC-generic: rule tables modelled on NFPA 70 (2017–2023 editions).
 * Every value is // VERIFY (from memory, see VERIFY.md).
 */
export const NEC_GENERIC: CodeProfile = {
  id: "NEC-generic",
  name: "NEC (generic)",
  caveat:
    "Tables modelled on NFPA 70 2017–2023 from memory. Verify against the edition adopted by your jurisdiction.",
  conductors: {
    ampacityTable: "nec-310.16",
    tableBaseAmbientC: NEC_310_16_BASE_AMBIENT_C,
    // NEC Table 310.15(C)(1) (2020+; 310.15(B)(3)(a) in 2017). // VERIFY
    bundlingFactors: [
      { minConductors: 1, maxConductors: 3, factor: 1.0 },
      { minConductors: 4, maxConductors: 6, factor: 0.8 },
      { minConductors: 7, maxConductors: 9, factor: 0.7 },
      { minConductors: 10, maxConductors: 20, factor: 0.5 },
      { minConductors: 21, maxConductors: 30, factor: 0.45 },
      { minConductors: 31, maxConductors: 40, factor: 0.4 },
      { minConductors: 41, maxConductors: Infinity, factor: 0.35 },
    ],
    // NEC 310.15(B)(2) (2020+; 310.15(B)(3)(c) in 2017): raceways/cables in direct
    // sunlight less than 7/8 in. (23 mm) above the roof get a 33 °C adder. // VERIFY
    // (NEC 2014 and earlier used a height table: 0–13 mm 33 °C, 13–90 mm 22 °C,
    //  90–300 mm 17 °C, 300–900 mm 14 °C.)
    rooftopAdders: [{ maxHeightMm: 23, adderC: 33 }],
    // NEC 240.4(D) small conductor rule, copper. // VERIFY
    smallConductorMaxOcpdA: { "14": 15, "12": 20, "10": 30 },
    // NEC 690.8(A)(1): PV source circuit maximum current = 125 % of Isc. // VERIFY
    pvMaxCurrentMultiplier: 1.25,
    // NEC 210.19(A)(1), 215.2(A)(1), 690.8(B): 125 % of continuous current. // VERIFY
    continuousMultiplier: 1.25,
    // NEC 110.14(C)(1): 60 °C for ≤ 100 A / 14–1 AWG unless marked; 75 °C is the
    // common marking today. Default here: 75 °C. // VERIFY
    defaultTerminalRatingC: 75,
  },
  // Not NEC requirements (informational notes 210.19 / 215.2); brief §5.4 defaults.
  voltageDropLimitsPct: { dcString: 2, branch: 3, total: 5 },
};
