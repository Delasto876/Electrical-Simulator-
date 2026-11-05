/**
 * Where a raceway runs, and the listing it needs there.
 *   indoor           dry interior: any type
 *   outdoor          wet location, in sun
 *   rooftop          wet location, in sun (ampacity adds the rooftop temperature adder by height)
 *   underground      direct burial
 *   physical-damage  exposed where it can be hit (e.g. PVC must be Schedule 80)
 */
export const RACEWAY_LOCATIONS = [
  "indoor",
  "outdoor",
  "rooftop",
  "underground",
  "physical-damage",
] as const;
export type RacewayLocation = (typeof RACEWAY_LOCATIONS)[number];

export interface RacewayListing {
  wetLocation: boolean;
  sunlightResistant: boolean;
  directBurial: boolean;
  physicalDamage: boolean;
}

/** Listings the raceway lacks for the location (empty = suitable). */
export function locationProblems(l: RacewayListing, location: RacewayLocation): string[] {
  const need: string[] = [];
  if (location === "outdoor" || location === "rooftop") {
    if (!l.wetLocation) need.push("wet locations");
    if (!l.sunlightResistant) need.push("sunlight");
  }
  if (location === "underground" && !l.directBurial) need.push("direct burial");
  if (location === "physical-damage" && !l.physicalDamage) need.push("physical damage");
  return need;
}

/** Location exposes the raceway to sun (PVC expansion adds the sun adder). */
export const inSun = (location: RacewayLocation) =>
  location === "outdoor" || location === "rooftop";
