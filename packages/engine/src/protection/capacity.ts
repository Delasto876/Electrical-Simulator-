import { issue, type Issue } from "../drc/issue";

/**
 * Capacity checks (brief §5.8): continuous load vs inverter rating, start-up
 * surge vs surge rating, and battery charge/discharge currents vs limits.
 * Surge model: the largest motor start happens while everything else runs:
 *   P_surge = Σ P_running + max_k (P_k · (surge_k − 1))
 */
export interface LoadInfo {
  id: string;
  name: string;
  powerW: number;
  surgeMultiplier: number;
}

export function checkInverterCapacity(
  inverterId: string,
  name: string,
  ratedW: number,
  surgeW: number,
  loads: readonly LoadInfo[],
): Issue[] {
  const out: Issue[] = [];
  if (loads.length === 0 || ratedW <= 0) return out;
  const running = loads.reduce((a, l) => a + l.powerW, 0);
  const start = running + Math.max(...loads.map((l) => l.powerW * (l.surgeMultiplier - 1)));
  if (running > ratedW) {
    out.push(
      issue(
        "error",
        "CAPACITY_CONTINUOUS",
        `${name}: connected loads ${running} W exceed the ${ratedW} W rating.`,
        [inverterId],
        "Shed loads or choose a larger inverter.",
      ),
    );
  }
  if (surgeW > 0 && start > surgeW) {
    out.push(
      issue(
        "warning",
        "CAPACITY_SURGE",
        `${name}: worst start-up ${start.toFixed(0)} W exceeds the ${surgeW} W surge rating.`,
        [inverterId],
        "Add a soft starter or a larger inverter.",
      ),
    );
  }
  return out;
}

export function checkBatteryCurrents(
  inverterId: string,
  name: string,
  inverterMaxDischargeA: number,
  inverterMaxChargeA: number,
  battery: { id: string; name: string; maxDischargeA: number; maxChargeA: number },
): Issue[] {
  const out: Issue[] = [];
  if (inverterMaxDischargeA > battery.maxDischargeA) {
    out.push(
      issue(
        "warning",
        "BATTERY_DISCHARGE",
        `${name} can draw ${inverterMaxDischargeA} A but ${battery.name} allows ${battery.maxDischargeA} A continuous.`,
        [inverterId, battery.id],
        "Add batteries in parallel or limit the inverter's discharge current in its settings.",
      ),
    );
  }
  if (inverterMaxChargeA > battery.maxChargeA) {
    out.push(
      issue(
        "warning",
        "BATTERY_CHARGE",
        `${name} can charge at ${inverterMaxChargeA} A but ${battery.name} accepts ${battery.maxChargeA} A.`,
        [inverterId, battery.id],
        "Limit the charge current in the inverter settings or add batteries in parallel.",
      ),
    );
  }
  return out;
}
