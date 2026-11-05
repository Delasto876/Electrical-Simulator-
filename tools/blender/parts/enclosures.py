"""Inverters / charge controllers and batteries: one glb per catalog entry with a modelUrl.

Free-part convention (shared with apps/web/src/parts/registry.ts freePartBox):
  glTF frame: origin at the bottom centre, +Y up, −Z = front.
  Blender frame (exported with +Y up): X = width, Z = up, +Y = front.
  Catalog port position [x, y, z] (glTF) → Blender (x, −z, y).
  Inverter dimensions: lengthMm = height, widthMm = width, heightMm = depth.
  Battery dimensions:  lengthMm = width,  widthMm = depth, heightMm = height.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.common import add_port, catalog_entries, cylinder, export_glb, material, mm, reset_scene, rounded_box  # noqa: E402

import bpy  # noqa: E402

BRAND_ACCENT = {"Deye": (0.05, 0.35, 0.65), "Growatt": (0.95, 0.55, 0.1), "Luxpower": (0.1, 0.5, 0.3),
                "SRNE": (0.75, 0.1, 0.1), "Sol-Ark": (0.1, 0.1, 0.1), "Generic": (0.4, 0.45, 0.5)}


def accent(brand: str) -> str:
    name = f"accent-{brand}"
    if bpy.data.materials.get(name) is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*BRAND_ACCENT.get(brand, (0.4, 0.4, 0.4)), 1.0)
        bsdf.inputs["Roughness"].default_value = 0.4
    return name


def b_pos(p):
    """glTF port position → Blender coordinates."""
    return (p[0], -p[2], p[1])


def b_dir(d):
    return (d[0], -d[2], d[1])


def port_fittings(ports):
    for p in ports:
        x, y, z = b_pos(p["position"])
        if p["type"] == "mc4":
            mat = "insulation-red" if p.get("polarity") == "+" else "insulation-black"
            cylinder(f"mc4-{p['id']}", mm(7), mm(18), mat, (x, y, z + mm(9) if z > 0.01 else z - mm(9)))
        elif p["type"] in ("battery-terminal", "dc-terminal"):
            cylinder(f"stud-{p['id']}", mm(6), mm(14), "copper", (x, y, z - mm(7) if z < 0.01 else z + mm(7)))
        elif p["type"] == "ac-terminal":
            cylinder(f"gland-{p['id']}", mm(9), mm(16), "pvc-grey", (x, y, z - mm(8)))
        elif p["type"] == "ground-point":
            cylinder(f"pe-{p['id']}", mm(5), mm(10), "tinned-copper", (x, y, z - mm(5)))
        add_port(p["id"], b_pos(p["position"]), b_dir(p["direction"]), port_type=p["type"],
                 polarity=p.get("polarity"), gender=p.get("gender"))


for entry in catalog_entries("inverters.json"):
    if not entry.get("modelUrl"):
        continue
    d = entry["dimensions"]
    h, w, dep = mm(d["lengthMm"]), mm(d["widthMm"]), mm(d["heightMm"])
    reset_scene()
    rounded_box("body", (w, dep, h), mm(12), "enclosure-white", location=(0, 0, h / 2))
    # front: display window and brand stripe
    rounded_box("display", (w * 0.35, mm(3), h * 0.12), mm(2), "insulation-black", location=(0, dep / 2 + mm(1), h * 0.7))
    rounded_box("stripe", (w * 0.9, mm(2), mm(14)), mm(1), accent(entry["brand"]), location=(0, dep / 2 + mm(0.5), h * 0.88))
    # heat-sink fins on the sides
    for side in (-1, 1):
        for k in range(5):
            rounded_box(f"fin-{side}-{k}", (mm(10), mm(4), h * 0.6), 0, "anodised-aluminium",
                        location=(side * (w / 2 + mm(5)), -dep / 2 + dep * (k + 1) / 6, h * 0.5))
    port_fittings(entry["ports"])
    print(export_glb(entry["id"]))

for entry in catalog_entries("batteries.json"):
    if not entry.get("modelUrl"):
        continue
    d = entry["dimensions"]
    w, dep, h = mm(d["lengthMm"]), mm(d["widthMm"]), mm(d["heightMm"])
    reset_scene()
    rounded_box("body", (w, dep, h), mm(8), "insulation-black", location=(0, 0, h / 2))
    rounded_box("label", (w * 0.6, mm(2), h * 0.25), mm(1), "anodised-aluminium", location=(0, dep / 2 + mm(1), h * 0.55))
    if w > 0.4:  # rack/wall units get front handles
        for side in (-1, 1):
            rounded_box(f"handle-{side}", (mm(20), mm(30), h * 0.6), mm(4), "galvanised-steel", location=(side * (w / 2 - mm(25)), dep / 2 + mm(15), h / 2))
    port_fittings(entry["ports"])
    print(export_glb(entry["id"]))
