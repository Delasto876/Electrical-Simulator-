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
  // Generic temperate defaults; set the project's own design temperatures (e.g.
  // ASHRAE extreme minimum / 2 % design high for the site). // VERIFY
  climateDefaults: { minAmbientC: -10, maxAmbientC: 40 },
  // Brief §5.3: Isc × 1.25 per string against the MPPT input rating. // VERIFY
  mpptIscMultiplier: 1.25,
  // NEC 690.12 requires rapid shutdown for PV on buildings (2014+). // VERIFY
  rapidShutdownRequired: true,
  grid: {
    frequencyHz: 60,
    voltages: ["120/240 V split-phase", "120/208 V three-phase", "277/480 V three-phase"],
  },
  protection: {
    // NEC 240.6(A) standard ampere ratings. // VERIFY
    standardOcpdA: [
      10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250,
      300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000,
    ],
    // NEC 240.4(B): next higher standard rating allowed up to 800 A. // VERIFY
    nextSizeUpMaxA: 800,
    // NEC Table 250.122, copper. // VERIFY
    egcTable: [
      { maxOcpdA: 15, awg: "14" },
      { maxOcpdA: 20, awg: "12" },
      { maxOcpdA: 60, awg: "10" },
      { maxOcpdA: 100, awg: "8" },
      { maxOcpdA: 200, awg: "6" },
      { maxOcpdA: 300, awg: "4" },
      { maxOcpdA: 400, awg: "3" },
      { maxOcpdA: 500, awg: "2" },
      { maxOcpdA: 600, awg: "1" },
      { maxOcpdA: 800, awg: "1/0" },
      { maxOcpdA: 1000, awg: "2/0" },
      { maxOcpdA: 1200, awg: "3/0" },
      { maxOcpdA: 1600, awg: "4/0" },
      { maxOcpdA: 2000, awg: "250" },
      { maxOcpdA: 2500, awg: "350" },
      { maxOcpdA: 3000, awg: "400" },
      { maxOcpdA: 4000, awg: "500" },
      { maxOcpdA: 5000, awg: "750" },
      { maxOcpdA: 6000, awg: "1000" },
    ],
    // NEC 250.66(A): GEC to a rod need not exceed 6 AWG Cu; table minimum 8 AWG Cu. // VERIFY
    gecMinAwg: "8",
    // NEC 250.53(A)(2) exception: a single rod of 25 Ω or less needs no supplemental electrode. // VERIFY
    groundRodMaxOhm: 25,
    // NEC 690.9(B): series fuse ≥ 125 % of max circuit current (Isc × 1.25) → Isc × 1.5625. // VERIFY
    stringFuseMultiplier: 1.5625,
  },
  raceway: {
    // NEC Chapter 9 Table 1 and Note 4 (nipples ≤ 24 in: 60 %). // VERIFY
    fillLimitsPct: { one: 53, two: 31, more: 40, nipple: 60 },
    nippleMaxM: 0.6096,
    // NEC 376.22(A) / 378.22: 20 % of the wireway cross-section; 376.22(B) derating above 30 CCC. // VERIFY
    wirewayFillPct: 20,
    wirewayNoDeratingUpTo: 30,
    // NEC 352.26, 348.26, 350.26, 356.26: no more than four quarter bends (360°) between pull points. // VERIFY
    maxBendDegBetweenPullPoints: 360,
    // NEC Chapter 9 Table 2, "other bends" column; 3/8 in is not listed (3 in assumed). // VERIFY
    minBendRadiusIn: [
      { tradeSizeIn: 0.375, radiusIn: 3 },
      { tradeSizeIn: 0.5, radiusIn: 4 },
      { tradeSizeIn: 0.75, radiusIn: 5 },
      { tradeSizeIn: 1, radiusIn: 6 },
      { tradeSizeIn: 1.25, radiusIn: 8 },
      { tradeSizeIn: 1.5, radiusIn: 10 },
      { tradeSizeIn: 2, radiusIn: 12 },
      { tradeSizeIn: 2.5, radiusIn: 15 },
      { tradeSizeIn: 3, radiusIn: 18 },
      { tradeSizeIn: 3.5, radiusIn: 21 },
      { tradeSizeIn: 4, radiusIn: 24 },
      { tradeSizeIn: 5, radiusIn: 30 },
      { tradeSizeIn: 6, radiusIn: 36 },
    ],
    // PVC: Table 352.30 (within 3 ft of boxes); FMC 348.30 and LFMC 350.30: 4½ ft, within 12 in;
    // LFNC 356.30: 3 ft, within 12 in. // VERIFY
    supportSpacing: [
      { family: "pvc", maxTradeSizeIn: 1, spacingFt: 3, endFt: 3 },
      { family: "pvc", maxTradeSizeIn: 2, spacingFt: 5, endFt: 3 },
      { family: "pvc", maxTradeSizeIn: 3, spacingFt: 6, endFt: 3 },
      { family: "pvc", maxTradeSizeIn: 5, spacingFt: 7, endFt: 3 },
      { family: "pvc", maxTradeSizeIn: 6, spacingFt: 8, endFt: 3 },
      { family: "fmc", maxTradeSizeIn: 6, spacingFt: 4.5, endFt: 1 },
      { family: "lfmc", maxTradeSizeIn: 6, spacingFt: 4.5, endFt: 1 },
      { family: "lfnc", maxTradeSizeIn: 6, spacingFt: 3, endFt: 1 },
      { family: "pvc-trunking", maxTradeSizeIn: 99, spacingFt: 3, endFt: 1 },
      { family: "steel-wireway", maxTradeSizeIn: 99, spacingFt: 5, endFt: 1 },
    ],
    // NEC 352.44: 3.38e-5 in/in/°F = 6.084e-5 /°C; fitting needed when the change is ≥ 1/4 in.
    // Sun adder: manufacturers' guidance (≈ 30 °F above ambient in direct sun). // VERIFY
    pvcExpansion: { coefPerC: 6.084e-5, thresholdIn: 0.25, sunAdderC: 17 },
  },
};
