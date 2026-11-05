import { isCategory, type Part } from "@solar-sim/catalog";
import { catalog, partLabel } from "../app/catalog";

/**
 * Catalog items a placed part can be swapped for while keeping its wiring:
 * the same category, and for DIN devices the same kind, poles and width (so
 * the ports and the rail slots stay valid). Sorted by rating, then name.
 */
export function swapOptions(part: Part): Part[] {
  const same = catalog.filter((c) => c.category === part.category);
  const fits = isCategory(part, "din-device")
    ? same.filter(
        (c) =>
          isCategory(c, "din-device") &&
          c.protection.kind === part.protection.kind &&
          c.protection.poles === part.protection.poles &&
          c.protection.modules === part.protection.modules,
      )
    : same.filter((c) => samePorts(c, part));
  return fits.sort((a, b) => ratingOf(a) - ratingOf(b) || partLabel(a).localeCompare(partLabel(b)));
}

function samePorts(a: Part, b: Part): boolean {
  const ids = (p: Part) =>
    p.ports
      .map((x) => x.id)
      .sort()
      .join("|");
  return ids(a) === ids(b);
}

function ratingOf(p: Part): number {
  if (isCategory(p, "din-device") || isCategory(p, "battery-protection"))
    return p.protection.ratedCurrentA;
  if (isCategory(p, "ats")) return p.ats.ratedCurrentA;
  return 0;
}
