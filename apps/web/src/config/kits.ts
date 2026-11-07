/**
 * KITS — ready-made DIN boxes: an enclosure from the catalog with the devices
 * already clicked onto its rail, placed as one step (one timeline card). The
 * parts are ordinary catalog parts: after placing, each device can be moved,
 * swapped or deleted like one placed by hand.
 *
 * Layouts are typical installer practice, not a product. `slot` is the
 * 18 mm module position from the left end of the rail, `row` the rail (0 = top).
 * model/kits.ts checks every kit fits (unit test).
 */
export interface KitDevice {
  catalogId: string;
  row: number;
  slot: number;
}

export interface Kit {
  id: string;
  name: string;
  /** One line for the card and the tooltip. */
  description: string;
  enclosureId: string;
  devices: KitDevice[];
  tags: string[];
}

const at = (catalogId: string, slot: number, row = 0): KitDevice => ({ catalogId, row, slot });

export const KITS: readonly Kit[] = [
  {
    id: "kit-pv-2in2out",
    name: "PV combiner 2-in 2-out (DC MCB + SPD)",
    description:
      "8-way box: a 2P 20 A DC breaker per string and a type 2 DC SPD per output, for two strings to two MPPTs (≤ 500 V).",
    enclosureId: "ht-enclosure-8way",
    devices: [
      at("generic-mcb-dc-2p-20a", 0),
      at("generic-mcb-dc-2p-20a", 2),
      at("generic-spd-dc-2p-1000v", 4),
      at("generic-spd-dc-2p-1000v", 6),
    ],
    tags: ["combiner", "PV", "2 in 2 out", "SPD", "DC"],
  },
  {
    id: "kit-battery-disconnect",
    name: "Battery disconnect box (125 A DC)",
    description: "4-way box with a 2P 125 A DC breaker between the battery and the inverter.",
    enclosureId: "ht-enclosure-4way",
    devices: [at("generic-mcb-dc-2p-125a", 0)],
    tags: ["battery", "disconnect", "DC breaker"],
  },
  {
    id: "kit-changeover",
    name: "Manual transfer switch box (I-0-II 63 A)",
    description:
      "5-way box: a 2P 63 A changeover switch (grid or generator / inverter) and an AC SPD.",
    enclosureId: "ht-enclosure-5way",
    devices: [at("generic-changeover-2p-63a", 0), at("generic-spd-ac-1pn", 3)],
    tags: ["changeover", "manual transfer switch", "MTS"],
  },
  {
    id: "kit-ats",
    name: "ATS box (dual power 63 A + voltage protector)",
    description:
      "8-way box: a DIN dual-power automatic transfer switch, an over/under-voltage protector and an AC SPD.",
    enclosureId: "ht-enclosure-8way",
    devices: [
      at("generic-ats-din-2p-63a", 0),
      at("generic-voltage-protector-63a", 4),
      at("generic-spd-ac-1pn", 6),
    ],
    tags: ["ATS", "automatic transfer switch", "voltage protector"],
  },
  {
    id: "kit-ac-distribution",
    name: "AC distribution board (12-way)",
    description:
      "12-way box: 2P 40 A main, 30 mA RCD, voltage protector, four final circuits (20/16/16/32 A) and an AC SPD.",
    enclosureId: "ht-enclosure-12way",
    devices: [
      at("generic-mcb-ac-2p-40a", 0),
      at("generic-rcd-2p-40a", 2),
      at("generic-voltage-protector-63a", 4),
      at("generic-mcb-ac-1p-20a", 6),
      at("generic-mcb-ac-1p-16a", 7),
      at("generic-mcb-ac-1p-16a", 8),
      at("generic-mcb-ac-1p-32a", 9),
      at("generic-spd-ac-1pn", 10),
    ],
    tags: ["distribution", "consumer unit", "AC", "RCD"],
  },
  {
    id: "kit-hybrid-board",
    name: "Hybrid inverter board, PV in + AC out (15-way)",
    description:
      "15-way box: two PV string breakers and a DC SPD on the left; AC isolator, 2P 40 A output breaker, voltage protector and AC SPD on the right.",
    enclosureId: "ht-enclosure-15way",
    devices: [
      at("generic-mcb-dc-2p-20a", 0),
      at("generic-mcb-dc-2p-20a", 2),
      at("generic-spd-dc-2p-1000v", 4),
      at("generic-isolator-ac-2p-63a", 7),
      at("generic-mcb-ac-2p-40a", 9),
      at("generic-voltage-protector-63a", 11),
      at("generic-spd-ac-1pn", 13),
    ],
    tags: ["hybrid", "PV", "AC", "SPD", "board"],
  },
];
