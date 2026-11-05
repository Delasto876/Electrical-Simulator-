import type { AwgSize, MetricSizeMm2 } from "../units";

/**
 * Conductor property tables.
 *
 * IMPORTANT: these values were entered from memory of the cited tables, not
 * copied from a licensed code book. Every table is marked // VERIFY and
 * listed in VERIFY.md. The brief's reference values for copper (14 AWG 3.14,
 * 12 AWG 1.98, 10 AWG 1.24, 8 AWG 0.778, 6 AWG 0.491, 4 AWG 0.308,
 * 2 AWG 0.194, 1/0 0.122, 4/0 0.0608 Ω/kft) agree with the copper column below.
 */

export type ConductorMaterial = "copper" | "aluminium";

/**
 * DC resistance of stranded, uncoated conductors at 75 °C [Ω per 1000 ft].
 * Source: NFPA 70 (NEC) Chapter 9, Table 8 "Conductor Properties". // VERIFY
 * Aluminium is not listed below 12 AWG.
 */
export const NEC_TABLE8_OHM_PER_KFT_75C: Record<
  ConductorMaterial,
  Partial<Record<AwgSize, number>>
> = {
  copper: {
    "18": 7.95,
    "16": 4.99,
    "14": 3.14,
    "12": 1.98,
    "10": 1.24,
    "8": 0.778,
    "6": 0.491,
    "4": 0.308,
    "3": 0.245,
    "2": 0.194,
    "1": 0.154,
    "1/0": 0.122,
    "2/0": 0.0967,
    "3/0": 0.0766,
    "4/0": 0.0608,
    "250": 0.0515,
    "300": 0.0429,
    "350": 0.0367,
    "400": 0.0321,
    "500": 0.0258,
    "600": 0.0214,
    "750": 0.0171,
    "1000": 0.0129,
  },
  aluminium: {
    "12": 3.25,
    "10": 2.04,
    "8": 1.28,
    "6": 0.808,
    "4": 0.508,
    "3": 0.403,
    "2": 0.319,
    "1": 0.253,
    "1/0": 0.201,
    "2/0": 0.159,
    "3/0": 0.126,
    "4/0": 0.1,
    "250": 0.0847,
    "300": 0.0707,
    "350": 0.0605,
    "400": 0.0529,
    "500": 0.0424,
    "600": 0.0353,
    "750": 0.0282,
    "1000": 0.0212,
  },
};

/**
 * Maximum DC resistance of class 2 (stranded) conductors at 20 °C [Ω/km].
 * Source: IEC 60228:2004 Table 2 (plain copper; aluminium from 16 mm²). // VERIFY
 */
export const IEC60228_OHM_PER_KM_20C: Record<
  ConductorMaterial,
  Partial<Record<MetricSizeMm2, number>>
> = {
  copper: {
    1.5: 12.1,
    2.5: 7.41,
    4: 4.61,
    6: 3.08,
    10: 1.83,
    16: 1.15,
    25: 0.727,
    35: 0.524,
    50: 0.387,
    70: 0.268,
    95: 0.193,
    120: 0.153,
    150: 0.124,
    185: 0.0991,
    240: 0.0754,
    300: 0.0601,
  },
  aluminium: {
    16: 1.91,
    25: 1.2,
    35: 0.868,
    50: 0.641,
    70: 0.443,
    95: 0.32,
    120: 0.253,
    150: 0.206,
    185: 0.164,
    240: 0.125,
    300: 0.1,
  },
};

/** Insulation temperature-rating columns of NEC 310.16. */
export type TempRatingC = 60 | 75 | 90;

/**
 * Allowable ampacities [A] of insulated conductors rated up to 2000 V, not
 * more than three current-carrying conductors in raceway, cable or earth,
 * based on 30 °C ambient. Columns 60 / 75 / 90 °C.
 * Source: NFPA 70 (NEC) Table 310.16 (2020/2023 numbering). // VERIFY
 * Entries for 18/16 AWG exist only in the 90 °C column (14 / 18 A).
 */
export const NEC_310_16_AMPACITY: Record<
  ConductorMaterial,
  Partial<Record<AwgSize, Partial<Record<TempRatingC, number>>>>
> = {
  copper: {
    "18": { 90: 14 },
    "16": { 90: 18 },
    "14": { 60: 15, 75: 20, 90: 25 },
    "12": { 60: 20, 75: 25, 90: 30 },
    "10": { 60: 30, 75: 35, 90: 40 },
    "8": { 60: 40, 75: 50, 90: 55 },
    "6": { 60: 55, 75: 65, 90: 75 },
    "4": { 60: 70, 75: 85, 90: 95 },
    "3": { 60: 85, 75: 100, 90: 115 },
    "2": { 60: 95, 75: 115, 90: 130 },
    "1": { 60: 110, 75: 130, 90: 145 },
    "1/0": { 60: 125, 75: 150, 90: 170 },
    "2/0": { 60: 145, 75: 175, 90: 195 },
    "3/0": { 60: 165, 75: 200, 90: 225 },
    "4/0": { 60: 195, 75: 230, 90: 260 },
    "250": { 60: 215, 75: 255, 90: 290 },
    "300": { 60: 240, 75: 285, 90: 320 },
    "350": { 60: 260, 75: 310, 90: 350 },
    "400": { 60: 280, 75: 335, 90: 380 },
    "500": { 60: 320, 75: 380, 90: 430 },
    "600": { 60: 350, 75: 420, 90: 475 },
    "750": { 60: 400, 75: 475, 90: 535 },
    "1000": { 60: 455, 75: 545, 90: 615 },
  },
  aluminium: {
    "12": { 60: 15, 75: 20, 90: 25 },
    "10": { 60: 25, 75: 30, 90: 35 },
    "8": { 60: 35, 75: 40, 90: 45 },
    "6": { 60: 40, 75: 50, 90: 55 },
    "4": { 60: 55, 75: 65, 90: 75 },
    "3": { 60: 65, 75: 75, 90: 85 },
    "2": { 60: 75, 75: 90, 90: 100 },
    "1": { 60: 85, 75: 100, 90: 115 },
    "1/0": { 60: 100, 75: 120, 90: 135 },
    "2/0": { 60: 115, 75: 135, 90: 150 },
    "3/0": { 60: 130, 75: 155, 90: 175 },
    "4/0": { 60: 150, 75: 180, 90: 205 },
    "250": { 60: 170, 75: 205, 90: 230 },
    "300": { 60: 195, 75: 230, 90: 260 },
    "350": { 60: 210, 75: 250, 90: 280 },
    "400": { 60: 225, 75: 270, 90: 305 },
    "500": { 60: 260, 75: 310, 90: 350 },
    "600": { 60: 285, 75: 340, 90: 385 },
    "750": { 60: 320, 75: 385, 90: 435 },
    "1000": { 60: 375, 75: 445, 90: 500 },
  },
};

/** Ambient temperature the 310.16 table is based on [°C]. NEC 310.16 heading. */
export const NEC_310_16_BASE_AMBIENT_C = 30;
