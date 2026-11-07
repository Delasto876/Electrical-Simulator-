#!/usr/bin/env python3
"""Generate the Phase 4 catalog files: combiner boxes, DIN-rail devices,
enclosures, battery fuses/breakers, transfer switches, grounding hardware,
utility services, generators and loads.

Edit the tables below and run:  python3 packages/catalog/scripts/gen_protection.py

Port convention (free-part frame, see apps/web/src/parts/registry.ts):
origin at the bottom centre, +y up, -z = front. DIN devices use the same
frame; the app mounts them on an enclosure's DIN rail.

All entries are GENERIC placeholders (verified: false). Ratings such as
interrupt capacity, voltage ratings and fuse sizes must be checked against
the product you install.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src" / "data"
NOTE = "Generic representative placeholder, not manufacturer data. Check the product's datasheet and listing."


def zero(o):
    if isinstance(o, float) and o == 0:
        return 0
    if isinstance(o, list):
        return [zero(v) for v in o]
    if isinstance(o, dict):
        return {k: zero(v) for k, v in o.items()}
    return o


def write(name, entries):
    (DATA / name).write_text(json.dumps(zero(entries), indent=2) + "\n")
    print(f"wrote {len(entries)} → {name}")


def base(id_, category, model, dims_mm, kg, price, tags, ports, model_url=True, unit="each"):
    l, w, h = dims_mm
    e = {"id": id_, "category": category, "brand": "Generic", "model": model,
         "dimensions": {"lengthMm": l, "widthMm": w, "heightMm": h}, "weightKg": kg, "verified": False, "notes": NOTE,
         "price": {"amount": price, "currency": "USD", "unit": unit}, "tags": tags, "ports": ports}
    if model_url:
        e["modelUrl"] = f"{id_}.glb"
    return e


def port(id_, type_, x, y, z, d, label, polarity=None, gender=None, group=None, connector=None):
    p = {"id": id_, "type": type_, "position": [round(x, 4), round(y, 4), round(z, 4)], "direction": d, "label": label}
    if polarity:
        p["polarity"] = polarity
    if gender:
        p["gender"] = gender
        p["connector"] = connector or f"generic-mc4-{gender}"
    if group:
        p["group"] = group
    return p


DOWN = [0, -1, 0]
UP = [0, 1, 0]
FRONT = [0, 0, -1]

# ---------------------------------------------------------------- combiner boxes
# (inputs, fuse A or None, disconnect A or None, spd, height, width, depth, kg, price)
COMBINERS = [(2, None, 32, True, 300, 250, 130, 3.5, 120), (4, 15, 63, True, 400, 300, 150, 5.5, 220),
             (6, 15, 80, True, 450, 350, 160, 7, 300), (8, 15, 100, True, 500, 400, 170, 8.5, 380)]
combiners = []
for n, fuse, disc, spd, h, w, d, kg, price in COMBINERS:
    W = w / 1000
    ports = []
    step = min(0.03, (W * 0.6) / (2 * n))
    x = -W / 2 + 0.03
    for k in range(1, n + 1):
        # inputs receive the string home runs: + female, - male (module + leads are male)
        ports.append(port(f"in{k}+", "mc4", x, 0, 0, DOWN, f"IN{k} +", "+", "female", f"in{k}"))
        x += step
        ports.append(port(f"in{k}-", "mc4", x, 0, 0, DOWN, f"IN{k} -", "-", "male", f"in{k}"))
        x += step
    ports.append(port("out+", "dc-terminal", W / 2 - 0.09, 0, 0, DOWN, "OUT +", "+", group="out"))
    ports.append(port("out-", "dc-terminal", W / 2 - 0.06, 0, 0, DOWN, "OUT -", "-", group="out"))
    ports.append(port("pe", "ground-point", W / 2 - 0.03, 0, 0, DOWN, "PE", "PE", group="pe"))
    e = base(f"generic-combiner-{n}s", "combiner-box",
             f"PV combiner box, {n} strings{', ' + str(fuse) + ' A fuses' if fuse else ', no fuses'}, {disc} A DC disconnect, SPD",
             (h, w, d), kg, price, ["combiner", f"{n}-string"], ports)
    e["protection"] = {"inputs": n, "fuseRatingA": fuse, "voltageRatingDcV": 1000, "disconnectRatingA": disc, "hasSpd": spd, "interruptRatingKa": 10}
    combiners.append(e)
write("combiner-boxes.json", combiners)

# ---------------------------------------------------------------- DIN devices
M = 0.018  # one DIN module [m]
DIN = [
    # id, model, kind, poles, modules, A, Vac, Vdc, kA, curve, polarity-sensitive, residual mA, price
    ("generic-mcb-ac-1p-16a", "AC MCB 1P 16 A C-curve 6 kA", "mcb-ac", 1, 1, 16, 230, None, 6, "C", False, None, 6),
    ("generic-mcb-ac-1p-20a", "AC MCB 1P 20 A C-curve 6 kA", "mcb-ac", 1, 1, 20, 230, None, 6, "C", False, None, 6),
    ("generic-mcb-ac-1p-32a", "AC MCB 1P 32 A C-curve 6 kA", "mcb-ac", 1, 1, 32, 230, None, 6, "C", False, None, 7),
    ("generic-mcb-ac-2p-40a", "AC MCB 2P 40 A C-curve 10 kA", "mcb-ac", 2, 2, 40, 400, None, 10, "C", False, None, 16),
    ("generic-mcb-ac-2p-63a", "AC MCB 2P 63 A C-curve 10 kA", "mcb-ac", 2, 2, 63, 400, None, 10, "C", False, None, 22),
    ("generic-mcb-ac-3p-32a", "AC MCB 3P 32 A C-curve 10 kA", "mcb-ac", 3, 3, 32, 400, None, 10, "C", False, None, 28),
    ("generic-mcb-ac-4p-63a", "AC MCB 4P 63 A C-curve 10 kA", "mcb-ac", 4, 4, 63, 400, None, 10, "C", False, None, 45),
    ("generic-mcb-ac-2p-63a-3ka", "AC MCB 2P 63 A C-curve 3 kA (low breaking capacity)", "mcb-ac", 2, 2, 63, 400, None, 3, "C", False, None, 12),
    ("generic-rcbo-1pn-20a", "RCBO 1P+N 20 A C-curve 30 mA type A 6 kA", "rcbo", 2, 2, 20, 230, None, 6, "C", False, 30, 32),
    ("generic-rcd-2p-40a", "RCD 2P 40 A 30 mA type A", "rcd", 2, 2, 40, 230, None, 6, None, False, 30, 30),
    ("generic-mcb-dc-2p-16a", "DC MCB 2P 16 A 500 V DC 6 kA (polarity-sensitive)", "mcb-dc", 2, 2, 16, None, 500, 6, "C", True, None, 18),
    ("generic-mcb-dc-2p-32a", "DC MCB 2P 32 A 500 V DC 6 kA (polarity-sensitive)", "mcb-dc", 2, 2, 32, None, 500, 6, "C", True, None, 20),
    ("generic-mcb-dc-2p-63a-1000v", "DC MCB 2P 63 A 1000 V DC 6 kA (polarity-sensitive)", "mcb-dc", 2, 2, 63, None, 1000, 6, "C", True, None, 34),
    ("generic-isolator-dc-2p-32a", "DC isolator 2P 32 A 1000 V DC", "isolator-dc", 2, 2, 32, None, 1000, 1, None, False, None, 22),
    ("generic-isolator-ac-2p-63a", "AC isolator 2P 63 A", "isolator-ac", 2, 2, 63, 400, None, 1, None, False, None, 14),
    ("generic-fuse-holder-dc-15a", "DC fuse holder 10×38 with 15 A gPV fuse, 1000 V DC", "fuse-holder-dc", 1, 1, 15, None, 1000, 30, None, False, None, 9),
    ("generic-spd-dc-2p-1000v", "DC SPD type 2, 1000 V DC", "spd-dc", 2, 2, 20, None, 1000, 20, None, False, None, 35),
    ("generic-spd-ac-1pn", "AC SPD type 2, 1P+N 275 V", "spd-ac", 2, 2, 20, 275, None, 20, None, False, None, 30),
]
POLES = {"mcb-ac": ["L1", "L2", "L3", "N"], "rcbo": ["L1", "N"], "rcd": ["L1", "N"], "isolator-ac": ["L1", "L2"], "spd-ac": ["L1", "N"],
         "mcb-dc": ["+", "-"], "isolator-dc": ["+", "-"], "fuse-holder-dc": ["+"], "spd-dc": ["+", "-"]}
din = []
for id_, model, kind, poles, mods, amps, vac, vdc, ka, curve, pol, rcd, price in DIN:
    W = mods * M
    ac = vac is not None and vdc is None
    t = "ac-terminal" if ac else "dc-terminal"
    names = POLES[kind][:poles]
    if kind == "mcb-ac" and poles == 4:
        names = ["L1", "L2", "L3", "N"]
    ports = []
    for k, pol_name in enumerate(names, start=1):
        x = -W / 2 + (k - 0.5) * W / poles
        ports.append(port(f"l{k}", t, x, 0.085, -0.02, UP, f"line {pol_name}", pol_name, group="line"))
        if not kind.startswith("spd"):
            ports.append(port(f"t{k}", t, x, 0.005, -0.02, DOWN, f"load {pol_name}", pol_name, group="load"))
    if kind.startswith("spd"):
        ports.append(port("pe", "ground-point", 0, 0.005, -0.02, DOWN, "PE", "PE", group="pe"))
    e = base(id_, "din-device", model, (round(W * 1000), 70, 90), 0.12 * mods, price, [kind, f"{amps}A", f"{poles}P"], ports)
    e["protection"] = {"kind": kind, "poles": poles, "modules": mods, "ratedCurrentA": amps, "voltageRatingAcV": vac, "voltageRatingDcV": vdc,
                       "breakingCapacityKa": ka, "curve": curve, "polaritySensitive": pol, "residualMa": rcd}
    din.append(e)
write("din-devices.json", din)

# ---------------------------------------------------------------- enclosures
ENCL = [("generic-enclosure-8m", "Plastic DIN enclosure, 8 modules, IP65, transparent door", 8, 1, "plastic", True, (200, 220, 110), 0.8, 25),
        ("generic-enclosure-12m", "Plastic DIN enclosure, 12 modules, IP65, transparent door", 12, 1, "plastic", True, (250, 300, 120), 1.1, 32),
        ("generic-enclosure-18m", "Plastic DIN enclosure, 18 modules, IP65", 18, 1, "plastic", False, (280, 400, 130), 1.6, 45),
        ("generic-enclosure-24m-metal", "Metal DIN enclosure, 2 × 12 modules, IP54", 12, 2, "metal", False, (450, 300, 150), 5.5, 85),
        ("generic-enclosure-36m-metal", "Metal DIN enclosure, 2 × 18 modules, IP54", 18, 2, "metal", False, (500, 420, 160), 7, 120)]
encl = []
for id_, model, per_row, rows, mat, door, (h, w, d), kg, price in ENCL:
    W, D = w / 1000, d / 1000
    ports = [port("pe", "ground-point", -W / 2 + 0.04, 0.04, -D / 2 + 0.03, FRONT, "PE bar", "PE", group="pe")]
    e = base(id_, "enclosure", model, (h, w, d), kg, price, ["enclosure", f"{per_row * rows} modules", mat], ports)
    e["enclosure"] = {"modulesPerRow": per_row, "rows": rows, "material": mat, "ipRating": "IP65" if mat == "plastic" else "IP54", "transparentDoor": door}
    encl.append(e)
write("enclosures.json", encl)

# ---------------------------------------------------------------- battery fuses / breakers
BP = [("generic-class-t-200a", "Class T fuse 200 A in holder, 125 V DC, 20 kA", "class-t", 200, 125, 20, (200, 60, 70), 0.6, 75),
      ("generic-class-t-300a", "Class T fuse 300 A in holder, 125 V DC, 20 kA", "class-t", 300, 125, 20, (220, 70, 80), 0.7, 95),
      ("generic-mrbf-150a", "MRBF terminal fuse 150 A, 58 V DC, 10 kA", "mrbf", 150, 58, 10, (60, 40, 30), 0.1, 25),
      ("generic-anl-250a", "ANL fuse 250 A in holder, 32 V DC, 6 kA", "anl", 250, 32, 6, (100, 40, 40), 0.15, 20),
      ("generic-dc-breaker-125a", "DC battery breaker 1P 125 A, 80 V DC, 10 kA", "dc-breaker", 125, 80, 10, (130, 55, 85), 0.4, 60),
      ("generic-dc-breaker-250a", "DC battery breaker 1P 250 A, 80 V DC, 15 kA", "dc-breaker", 250, 80, 15, (150, 70, 95), 0.6, 95)]
bp = []
for id_, model, kind, amps, v, ka, (l, w, h), kg, price in BP:
    L = l / 1000
    ports = [port("in", "dc-terminal", -L / 2 + 0.015, h / 1000, 0, UP, "battery side", "+", group="dc"),
             port("out", "dc-terminal", L / 2 - 0.015, h / 1000, 0, UP, "inverter side", "+", group="dc")]
    e = base(id_, "battery-protection", model, (l, w, h), kg, price, [kind, f"{amps}A"], ports)
    e["protection"] = {"kind": kind, "ratedCurrentA": amps, "voltageRatingDcV": v, "interruptRatingKa": ka}
    bp.append(e)
write("battery-protection.json", bp)

# ---------------------------------------------------------------- transfer switches
ATS = [("generic-ats-2s-63a-1pn", "ATS 2-source 63 A 1P+N (switched neutral), 230 V", 2, 63, 230, "single-phase", True, ["L1", "N"], 140),
       ("generic-ats-2s-100a-split", "ATS 2-source 100 A, 120/240 V split-phase, neutral not switched", 2, 100, 240, "split-phase", False, ["L1", "L2", "N"], 260),
       ("generic-ats-3s-63a-1pn", "ATS 3-source 63 A 1P+N (utility / generator / inverter), 230 V", 3, 63, 230, "single-phase", True, ["L1", "N"], 220)]
ats = []
for id_, model, n, amps, v, system, sw_n, conds, price in ATS:
    W = 0.3
    ports = []
    x = -W / 2 + 0.03
    for s in range(1, n + 1):
        for c in conds:
            ports.append(port(f"s{s}-{c.lower()}", "ac-terminal", x, 0, 0, DOWN, f"S{s} {c}", c, group=f"s{s}"))
            x += 0.015
        x += 0.01
    for c in conds:
        ports.append(port(f"load-{c.lower()}", "ac-terminal", x, 0, 0, DOWN, f"LOAD {c}", c, group="load"))
        x += 0.015
    ports.append(port("pe", "ground-point", W / 2 - 0.02, 0, 0, DOWN, "PE", "PE", group="pe"))
    e = base(id_, "ats", model, (400, 300, 180), 6, price, ["ATS", f"{n}-source", system], ports)
    e["ats"] = {"sources": n, "ratedCurrentA": amps, "voltageV": v, "system": system, "switchedNeutral": sw_n, "automatic": True,
                "transferDelayS": 5, "retransferDelayS": 60, "spd": True, "voltageRegulation": False}
    ats.append(e)
write("ats.json", ats)

# ---------------------------------------------------------------- grounding
gr = []
for id_, model, L, dmm, price in [("generic-ground-rod-2400x16", "Copper-bonded ground rod 2.4 m × 16 mm (8 ft × 5/8 in)", 2.4, 16, 18),
                                  ("generic-ground-rod-3000x16", "Copper-bonded ground rod 3.0 m × 16 mm (10 ft × 5/8 in)", 3.0, 16, 24)]:
    e = base(id_, "grounding", model, (dmm, dmm, round(L * 1000)), round(L * 1.6, 1), price, ["ground rod", "GEC"],
             [port("rod", "ground-point", 0, 0.15, 0, UP, "rod clamp", "PE", group="pe")])
    e["grounding"] = {"kind": "ground-rod", "rodLengthM": L, "rodDiameterMm": dmm}
    gr.append(e)
e = base("generic-ground-bar", "grounding", "Ground bar, 10 terminals", (150, 30, 30), 0.3, 8, ["ground bar"],
         [port("bar", "ground-point", 0, 0.03, 0, UP, "ground bar", "PE", group="pe")])
e["grounding"] = {"kind": "ground-bar"}
gr.append(e)
for id_, model, kind, price in [("generic-lay-in-lug", "Lay-in grounding lug for rails (bonding listed)", "lay-in-lug", 3),
                                ("generic-weeb", "WEEB bonding washer (module to rail)", "weeb", 0.6)]:
    e = base(id_, "grounding", model, (30, 20, 20), 0.02, price, [kind], [], model_url=False)
    e["grounding"] = {"kind": kind}
    gr.append(e)
write("grounding.json", gr)

# ---------------------------------------------------------------- utility services and generators
def ac_ports(conds, x0, y, z, d=DOWN):
    out, x = [], x0
    for c in conds:
        out.append(port(c.lower(), "ac-terminal", x, y, z, d, c, c, group="ac"))
        x += 0.02
    out.append(port("pe", "ground-point", x + 0.01, y, z, d, "PE", "PE", group="pe"))
    return out

src = []
for id_, model, v, ln, system, hz, ka, conds, price in [
        ("generic-utility-120-240-60hz", "Utility service 120/240 V 60 Hz split-phase (meter base)", 240, 120, "split-phase", 60, 10, ["L1", "L2", "N"], 0),
        ("generic-utility-110-220-50hz", "Utility service 110/220 V 50 Hz split-phase (meter base)", 220, 110, "split-phase", 50, 10, ["L1", "L2", "N"], 0),
        ("generic-utility-230-50hz", "Utility service 230 V 50 Hz single-phase (meter base)", 230, None, "single-phase", 50, 6, ["L1", "N"], 0)]:
    e = base(id_, "utility", model, (350, 230, 120), 3, price, ["utility", system, f"{hz}Hz"], ac_ports(conds, -0.06, 0, 0))
    e["source"] = {"voltageV": v, "system": system, "frequencyHz": hz, "availableFaultCurrentKa": ka, **({"lineToNeutralV": ln} if ln else {})}
    src.append(e)
write("utilities.json", src)

gens = []
for id_, model, kva, v, ln, system, hz, bonded, conds, price, dims in [
        ("generic-generator-7k5-split-60hz", "Generator 7.5 kVA 120/240 V 60 Hz (bonded neutral)", 7.5, 240, 120, "split-phase", 60, True, ["L1", "L2", "N"], 1800, (900, 600, 650)),
        ("generic-generator-10k-230v-50hz", "Generator 10 kVA 230 V 50 Hz (floating neutral)", 10, 230, None, "single-phase", 50, False, ["L1", "N"], 2600, (1000, 650, 700))]:
    l, w, h = dims
    e = base(id_, "generator", model, dims, 120, price, ["generator", system, f"{hz}Hz"], ac_ports(conds, l / 2000 - 0.15, h / 1000 * 0.5, -w / 2000, FRONT))
    # generator prospective fault current ≈ rated current / subtransient reactance (~0.15) // VERIFY
    i_rated = kva * 1000 / v
    e["source"] = {"voltageV": v, "system": system, "frequencyHz": hz, "availableFaultCurrentKa": round(i_rated / 0.15 / 1000, 2),
                   "ratedKva": kva, "neutralBonded": bonded, **({"lineToNeutralV": ln} if ln else {})}
    gens.append(e)
write("generators.json", gens)

loads = []
for id_, model, w, pf, surge, v, cont, price in [("generic-load-lighting-300w", "Lighting circuit 300 W", 300, 0.95, 1, 230, True, 0),
                                                  ("generic-load-fridge-150w", "Refrigerator 150 W (compressor start ×5)", 150, 0.8, 5, 230, True, 0),
                                                  ("generic-load-ac-1200w", "Split air-conditioner 1.2 kW (start ×3)", 1200, 0.9, 3, 230, True, 0),
                                                  ("generic-load-pump-750w", "Water pump 750 W (start ×4)", 750, 0.8, 4, 230, False, 0)]:
    e = base(id_, "load", model, (500, 400, 600), 10, price, ["load"], ac_ports(["L1", "N"], -0.05, 0.6 * 0.5, -0.2, FRONT), model_url=False)
    e["load"] = {"powerW": w, "powerFactor": pf, "surgeMultiplier": surge, "voltageV": v, "continuous": cont}
    loads.append(e)
write("loads.json", loads)

# Phase 5: datasheet values found online, new brand models, DIN boxes and devices (patches the JSON above)
import p5_datasheets  # noqa: E402

p5_datasheets.main()
