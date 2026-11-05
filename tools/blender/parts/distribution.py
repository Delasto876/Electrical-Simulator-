"""Phase 4 equipment: DIN-rail devices, enclosures, combiner boxes, battery
fuses/breakers, transfer switches, ground rods, utility meter bases and
generators. One glb per catalog entry with a modelUrl; sizes from the catalog.

Free-part frame (see enclosures.py): Blender X = width, Z = up, +Y = front;
glTF port [x, y, z] → Blender (x, −z, y).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.common import add_port, catalog_entries, cylinder, export_glb, mm, reset_scene, rounded_box  # noqa: E402


def b_pos(p):
    return (p[0], -p[2], p[1])


def b_dir(d):
    return (d[0], -d[2], d[1])


def ports(entry, studs=True):
    for p in entry["ports"]:
        x, y, z = b_pos(p["position"])
        if studs and p["type"] in ("dc-terminal", "ac-terminal"):
            cylinder(f"term-{p['id']}", mm(3), mm(6), "tinned-copper", (x, y, z))
        elif studs and p["type"] == "ground-point":
            cylinder(f"pe-{p['id']}", mm(4), mm(8), "tinned-copper", (x, y, z))
        elif p["type"] == "mc4":
            mat = "insulation-red" if p.get("polarity") == "+" else "insulation-black"
            cylinder(f"mc4-{p['id']}", mm(7), mm(18), mat, (x, y, z - mm(9)))
        add_port(p["id"], b_pos(p["position"]), b_dir(p["direction"]), port_type=p["type"], polarity=p.get("polarity"), gender=p.get("gender"))


# ---------------------------------------------------------------- DIN devices (width = modules × 18 mm)
for e in catalog_entries("din-devices.json"):
    w, d, h = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    kind = e["protection"]["kind"]
    reset_scene()
    body = "insulation-black" if kind.startswith("spd") else "enclosure-white"
    rounded_box("body", (w - mm(0.5), d * 0.75, h), mm(1.5), body, location=(0, -d * 0.1, h / 2))
    rounded_box("front", (w - mm(1), d * 0.25, h * 0.45), mm(1.5), body, location=(0, d * 0.35, h / 2))
    # toggle (red for DC, blue for AC, yellow test button for RCD/RCBO)
    lever = "insulation-red" if kind.endswith("dc") else "accent-orange" if kind in ("rcd", "rcbo") else "pvc-grey"
    rounded_box("toggle", (w * 0.6, mm(8), mm(14)), mm(1), lever, location=(0, d * 0.5 + mm(3), h / 2))
    ports(e)
    print(export_glb(e["id"]))

# ---------------------------------------------------------------- enclosures with DIN rails
for e in catalog_entries("enclosures.json"):
    hgt, w, d = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    rows = e["enclosure"]["rows"]
    rail_len = e["enclosure"]["modulesPerRow"] * mm(18)
    metal = e["enclosure"]["material"] == "metal"
    reset_scene()
    shell = "galvanised-steel" if metal else "enclosure-white"
    rounded_box("back", (w, mm(3), hgt), mm(2), shell, location=(0, -d / 2 + mm(1.5), hgt / 2))
    for side, (sx, sz) in {"left": (-1, 0), "right": (1, 0)}.items():
        rounded_box(f"wall-{side}", (mm(3), d, hgt), mm(1), shell, location=(sx * (w / 2 - mm(1.5)), 0, hgt / 2))
    for side, sz in (("top", hgt - mm(1.5)), ("bottom", mm(1.5))):
        rounded_box(f"wall-{side}", (w, d, mm(3)), mm(1), shell, location=(0, 0, sz))
    for r in range(rows):
        z = hgt * (rows - r) / (rows + 1)
        rounded_box(f"rail-{r}", (rail_len, mm(8), mm(35)), 0, "galvanised-steel", location=(0, -d / 2 + mm(25) - mm(4), z))
    rounded_box("pe-bar", (mm(60), mm(10), mm(12)), 0, "tinned-copper", location=(-w / 2 + mm(40), -d / 2 + mm(30), mm(40)))
    ports(e, studs=False)
    print(export_glb(e["id"]))

# ---------------------------------------------------------------- combiner boxes
for e in catalog_entries("combiner-boxes.json"):
    hgt, w, d = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    reset_scene()
    rounded_box("body", (w, d, hgt), mm(6), "pvc-grey", location=(0, 0, hgt / 2))
    rounded_box("handle", (mm(40), mm(25), mm(60)), mm(4), "insulation-red", location=(w * 0.25, d / 2 + mm(12), hgt * 0.6))
    rounded_box("label", (w * 0.5, mm(1), mm(30)), 0, "accent-orange", location=(-w * 0.1, d / 2 + mm(0.5), hgt * 0.85))
    ports(e)
    print(export_glb(e["id"]))

# ---------------------------------------------------------------- battery fuses / breakers
for e in catalog_entries("battery-protection.json"):
    l, w, h = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    kind = e["protection"]["kind"]
    reset_scene()
    rounded_box("base", (l, w, h * 0.5), mm(3), "insulation-black", location=(0, 0, h * 0.25))
    if kind == "dc-breaker":
        rounded_box("breaker", (l * 0.6, w * 0.9, h * 0.5), mm(3), "insulation-black", location=(0, 0, h * 0.75))
        rounded_box("lever", (mm(12), mm(10), mm(20)), mm(2), "insulation-red", location=(0, w * 0.45, h * 0.8))
    else:
        rounded_box("fuse", (l * 0.55, w * 0.55, h * 0.4), mm(4), "enclosure-white", location=(0, 0, h * 0.7))
    for pid in ("in", "out"):
        p = next(x for x in e["ports"] if x["id"] == pid)
        x, y, z = b_pos(p["position"])
        cylinder(f"stud-{pid}", mm(5), mm(12), "copper", (x, y, z - mm(6)))
        add_port(pid, b_pos(p["position"]), b_dir(p["direction"]), port_type=p["type"], polarity=p.get("polarity"))
    print(export_glb(e["id"]))

# ---------------------------------------------------------------- transfer switches
for e in catalog_entries("ats.json"):
    hgt, w, d = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    reset_scene()
    rounded_box("body", (w, d, hgt), mm(6), "galvanised-steel", location=(0, 0, hgt / 2))
    rounded_box("panel", (w * 0.6, mm(2), hgt * 0.25), mm(2), "insulation-black", location=(0, d / 2 + mm(1), hgt * 0.65))
    for k in range(e["ats"]["sources"]):
        cylinder(f"led-{k}", mm(5), mm(3), "accent-orange" if k == 0 else "pvc-grey", (-w * 0.2 + k * mm(30), d / 2 + mm(2), hgt * 0.4))
    ports(e)
    print(export_glb(e["id"]))

# ---------------------------------------------------------------- ground rods (mostly below grade)
for e in catalog_entries("grounding.json"):
    if not e.get("modelUrl"):
        continue
    reset_scene()
    g = e["grounding"]
    if g["kind"] == "ground-rod":
        L = g["rodLengthM"]
        r = mm(g["rodDiameterMm"]) / 2
        cylinder("rod", r, L, "copper", (0, 0, 0.15 - L / 2))
        cylinder("clamp", r * 2.2, mm(25), "copper", (0, 0, 0.12))
        rounded_box("pit", (0.25, 0.25, mm(20)), mm(4), "pvc-grey", location=(0, 0, mm(10)))
    else:
        rounded_box("bar", (mm(150), mm(30), mm(30)), mm(2), "tinned-copper", location=(0, 0, mm(15)))
    ports(e, studs=False)
    print(export_glb(e["id"]))

# ---------------------------------------------------------------- utility meter bases and generators
for e in catalog_entries("utilities.json"):
    hgt, w, d = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    reset_scene()
    rounded_box("base", (w, d, hgt), mm(6), "galvanised-steel", location=(0, 0, hgt / 2))
    cylinder("meter", mm(70), mm(60), "enclosure-white", (0, d / 2 + mm(25), hgt * 0.6), vertices=32)
    ports(e)
    print(export_glb(e["id"]))

for e in catalog_entries("generators.json"):
    l, w, h = mm(e["dimensions"]["lengthMm"]), mm(e["dimensions"]["widthMm"]), mm(e["dimensions"]["heightMm"])
    reset_scene()
    rounded_box("frame", (l, w, h * 0.15), mm(5), "insulation-black", location=(0, 0, h * 0.075))
    rounded_box("housing", (l * 0.95, w * 0.9, h * 0.8), mm(30), "accent-orange", location=(0, 0, h * 0.55))
    rounded_box("panel", (l * 0.3, mm(3), h * 0.25), mm(3), "insulation-black", location=(l * 0.25, w / 2 * 0.9 + mm(1), h * 0.55))
    ports(e)
    print(export_glb(e["id"]))
