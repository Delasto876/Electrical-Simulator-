/**
 * Hourly weather for the simulation. Each value is the average over the hour
 * that ENDS at `timesMs[i]` (UTC), which is how Open-Meteo / ERA5 report
 * radiation. Irradiance W/m², temperature °C (2 m), wind m/s (10 m).
 */
export interface WeatherSeries {
  source: "open-meteo" | "clear-sky";
  /** Human description: dataset and grid point actually used. */
  label: string;
  latitudeDeg: number;
  longitudeDeg: number;
  timesMs: number[];
  ghiWm2: number[];
  dniWm2: number[];
  dhiWm2: number[];
  tempC: number[];
  windMs: number[];
}

export interface Place {
  name: string;
  /** "Kingston, Jamaica" style label. */
  label: string;
  latitudeDeg: number;
  longitudeDeg: number;
  timeZone: string;
}
