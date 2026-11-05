/**
 * Named constants used by the engine. Every value cites its source.
 * Values recalled from memory rather than read from a cited document are
 * marked `// VERIFY` and listed in VERIFY.md.
 */

// ---------------------------------------------------------------- physics
/** Boltzmann constant over elementary charge, k/q [V/K]. CODATA 2018 exact: k = 1.380649e-23 J/K, q = 1.602176634e-19 C. */
export const K_OVER_Q_V_PER_K = 1.380649e-23 / 1.602176634e-19;
/** Boltzmann constant in eV/K (= k/q numerically). CODATA 2018 exact. */
export const BOLTZMANN_EV_PER_K = K_OVER_Q_V_PER_K;
/** 0 °C in kelvin. SI definition. */
export const ZERO_C_IN_K = 273.15;

// ---------------------------------------------------------------- PV reference conditions
/** Standard Test Conditions irradiance [W/m²]. IEC 61215 / IEC 60904-3. */
export const STC_IRRADIANCE_W_M2 = 1000;
/** STC cell temperature [°C]. IEC 61215. */
export const STC_CELL_TEMP_C = 25;
/** NOCT test irradiance [W/m²] and ambient [°C] used by the NOCT cell-temperature model. IEC 61215 NOCT conditions: 800 W/m², 20 °C ambient, 1 m/s wind. */
export const NOCT_IRRADIANCE_W_M2 = 800;
export const NOCT_AMBIENT_C = 20;

/**
 * Silicon band gap at reference temperature [eV] and its temperature
 * dependence [1/K], as used by De Soto et al. (2006), "Improvement and
 * validation of a model for photovoltaic array performance", Solar Energy 80,
 * 78–88, Eq. 10: Eg = Eg_ref · (1 + dEgdT · (T − T_ref)). Same defaults as pvlib.
 */
export const DESOTO_EG_REF_EV = 1.121;
export const DESOTO_DEGDT_PER_K = -0.0002677;

/**
 * Faiman cell-temperature model defaults, U0 [W/(m²·K)] and U1 [W·s/(m³·K)].
 * Faiman (2008), Prog. Photovolt. 16, 307–315; defaults as in pvlib
 * `temperature.faiman` (U0 = 25, U1 = 6.84). // VERIFY
 */
export const FAIMAN_U0 = 25;
export const FAIMAN_U1 = 6.84;

// ---------------------------------------------------------------- conductors
/**
 * Temperature coefficient of resistance at 20 °C [1/°C].
 * Copper 0.00393: annealed copper, IEC 60028 / ASTM B193 (brief §5.4).
 * Aluminium 0.00403: EC-grade aluminium, IEC 60889. // VERIFY (aluminium)
 * Check: NEC Chapter 9 Table 8 note gives α = 0.00323 (Cu) and 0.00330 (Al)
 * referred to 75 °C; 0.00393/(1+0.00393·55) = 0.00323 and
 * 0.00403/(1+0.00403·55) = 0.00330, so the two forms agree.
 */
export const ALPHA20_COPPER_PER_C = 0.00393;
export const ALPHA20_ALUMINIUM_PER_C = 0.00403;

/** Reference temperature of NEC Chapter 9 Table 8 resistances [°C]. NEC Ch. 9 Table 8 heading. */
export const NEC_TABLE8_REF_TEMP_C = 75;
/** Reference temperature of IEC 60228 conductor resistances [°C]. IEC 60228 Table 2. */
export const IEC60228_REF_TEMP_C = 20;

// ---------------------------------------------------------------- units (exact definitions)
/** International foot = 0.3048 m exactly (1959 international yard and pound agreement). */
export const METRES_PER_FOOT = 0.3048;
/** 1 kcmil = 1000 circular mils; 1 cmil = (π/4)·(0.001 in)² = 5.067074791e-4 mm². Exact from inch = 25.4 mm. */
export const MM2_PER_KCMIL = (Math.PI / 4) * 0.0254 * 0.0254 * 1000;

// ---------------------------------------------------------------- circuit solver
/** Tiny conductance from every node to ground [S] so floating nodes do not make the MNA matrix singular. Standard SPICE practice (GMIN = 1e-12). */
export const MNA_GMIN_S = 1e-12;

// ---------------------------------------------------------------- connectors
/**
 * Contact resistance of one mated MC4 connector pair [Ω]. Brief §5.1 default
 * "about 0.5 mΩ per MC4 pair"; connector datasheets quote ≤ 0.25–0.5 mΩ. // VERIFY
 */
export const MC4_PAIR_RESISTANCE_OHM = 0.0005;

/** Cell temperature rise model for the hot-weather Vmp check: full sun [W/m²]. */
export const DESIGN_HOT_IRRADIANCE_W_M2 = 1000;

// ---------------------------------------------------------------- grounding
/**
 * Typical soil resistivity [Ω·m] by soil type, mid-range values.
 * Source: IEEE Std 142 ("Green Book") §4, typical-resistivity table. // VERIFY
 * Measure the site (Wenner four-pin) for a real design.
 */
export const SOIL_RESISTIVITY_OHM_M = {
  "wet-organic": 10,
  "moist-clay": 50,
  "average-soil": 100,
  "sandy-dry": 500,
  "gravel-rocky": 2000,
} as const;
export type SoilType = keyof typeof SOIL_RESISTIVITY_OHM_M;

/**
 * Multiplying factor for n parallel ground rods spaced about one rod length
 * apart: R_n ≈ (R_1 / n) · F_n. Source: IEEE Std 142 Table 4-5 (spacing = rod
 * length). // VERIFY
 */
export const MULTI_ROD_FACTOR: Record<number, number> = {
  1: 1,
  2: 1.16,
  3: 1.29,
  4: 1.36,
  8: 1.68,
  12: 1.8,
  16: 1.92,
  20: 2.0,
  24: 2.16,
};
