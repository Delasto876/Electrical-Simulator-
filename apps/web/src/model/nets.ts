import { UnionFind } from "@solar-sim/engine";
import type { CableInstance, FreePart } from "../project/projectFile";
import { deviceLinks, type DeviceLink } from "./deviceLinks";
import type { PortKey } from "./ports";

/**
 * Electrical connectivity.
 *   - A WIRE NET is a set of ports joined by cables only (one potential).
 *   - DEVICE LINKS (breakers, fuses, combiners, ATS) join wire nets.
 * `reach()` walks from a net through device links and reports every net
 * reached with the devices on the way — "is there a fuse between the battery
 * and the inverter?", "which MPPT does this string reach?".
 */
export interface NetGraph {
  netOf: (k: PortKey) => string;
  links: DeviceLink[];
  /** Cable ids whose ends lie in a net. */
  cablesIn: Map<string, string[]>;
  /** Ports in each net. */
  portsIn: Map<string, PortKey[]>;
  reach: (
    fromNet: string,
    opts?: { through?: (l: DeviceLink) => boolean },
  ) => Map<string, { nets: string[]; links: DeviceLink[] }>;
}

export function buildNets(
  portKeys: Iterable<PortKey>,
  cables: readonly CableInstance[],
  parts: readonly FreePart[],
  atsActive: ReadonlyMap<string, number | null>,
): NetGraph {
  const uf = new UnionFind();
  for (const k of portKeys) uf.add(k);
  for (const c of cables) uf.union(c.from, c.to);
  const links = parts.flatMap((p) => deviceLinks(p, atsActive.get(p.id)));
  const cablesIn = new Map<string, string[]>();
  for (const c of cables) {
    const n = uf.find(c.from);
    cablesIn.set(n, [...(cablesIn.get(n) ?? []), c.id]);
  }
  const portsIn = new Map<string, PortKey[]>();
  for (const k of portKeys) {
    const n = uf.find(k);
    portsIn.set(n, [...(portsIn.get(n) ?? []), k]);
  }
  const adj = new Map<string, { to: string; link: DeviceLink }[]>();
  for (const l of links) {
    const a = uf.find(l.a);
    const b = uf.find(l.b);
    if (a === b) continue;
    adj.set(a, [...(adj.get(a) ?? []), { to: b, link: l }]);
    adj.set(b, [...(adj.get(b) ?? []), { to: a, link: l }]);
  }
  const reach: NetGraph["reach"] = (fromNet, opts) => {
    const seen = new Map<string, { nets: string[]; links: DeviceLink[] }>([
      [fromNet, { nets: [fromNet], links: [] }],
    ]);
    const queue = [fromNet];
    while (queue.length) {
      const cur = queue.shift()!;
      const path = seen.get(cur)!;
      for (const e of adj.get(cur) ?? []) {
        if (seen.has(e.to) || (opts?.through && !opts.through(e.link))) continue;
        seen.set(e.to, { nets: [...path.nets, e.to], links: [...path.links, e.link] });
        queue.push(e.to);
      }
    }
    return seen;
  };
  return { netOf: (k) => uf.find(k), links, cablesIn, portsIn, reach };
}
