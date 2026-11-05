import { NEC_GENERIC } from "./necGeneric";
import type { CodeProfile } from "./types";

/**
 * Jamaica regional preset (brief §6). The electrical tables follow the NEC
 * (Jamaica's electrical inspection practice is NEC-based); the climate, grid
 * and wind defaults are EDITABLE ASSUMPTIONS, not authoritative figures. Check
 * them against the current Government Electrical Regulator (GER) rules, JPS
 * interconnection requirements and local climate data. // VERIFY (all)
 */
export const JAMAICA: CodeProfile = {
  ...NEC_GENERIC,
  id: "Jamaica",
  name: "Jamaica (NEC-based preset)",
  caveat:
    "NEC-based tables with Jamaican defaults: 50 Hz, 110/220 V split-phase (120/240 V equipment) and 230 V, hot climate, hurricane wind. Defaults are editable assumptions: verify with the GER, JPS and local data.",
  // Hot, humid coastal climate. Coastal record lows are about 15–18 °C; 10 °C
  // gives margin for elevated inland sites (Blue Mountains are colder still). // VERIFY
  climateDefaults: { minAmbientC: 10, maxAmbientC: 35 },
  // Rapid shutdown: not assumed mandatory; confirm with the inspector. // VERIFY
  rapidShutdownRequired: false,
  // JPS nominal supply is 110/220 V split-phase at 50 Hz; much equipment is rated
  // 120/240 V (the brief's figure). Three-phase service voltage: confirm with JPS. // VERIFY
  grid: {
    frequencyHz: 50,
    voltages: [
      "110/220 V split-phase (JPS nominal)",
      "120/240 V split-phase (equipment rating)",
      "230 V single-phase",
      "three-phase: confirm with JPS",
    ],
  },
};
