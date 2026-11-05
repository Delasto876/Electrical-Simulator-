"""End and mid module clamps, one glb per catalog entry in module-clamps.json.

Frame (Blender, metres): X along the rail, Y across the rail, Z up.
Origin = rail top (the clamp seat), so the layout engine's clamp position
(on the rail top) is exactly where the model goes. End clamps grip a module
on their +X side.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.common import add_port, catalog_entries, cylinder, export_glb, mm, reset_scene, rounded_box  # noqa: E402

LIP_MM = 10      # how far the clamp lip reaches over the module frame
PLATE_MM = 4     # lip / top plate thickness
BOLT_HEAD_MM = 6 # bolt head radius (M8 socket head ≈ 13 mm across)

for entry in catalog_entries("module-clamps.json"):
    m = entry["mounting"]
    t = mm(m["frameThicknessMm"])
    w = mm(m["widthMm"])                 # along the rail
    depth = mm(entry["dimensions"]["widthMm"])  # across the rail
    plate = mm(PLATE_MM)
    reset_scene()
    if m["kind"] == "end":
        # vertical body up to the frame top, lip over the module edge (+X)
        rounded_box("body", (w, depth, t), mm(1.5), "anodised-aluminium", location=(0, 0, t / 2))
        rounded_box("lip", (w + mm(LIP_MM), depth, plate), mm(1), "anodised-aluminium",
                    location=(mm(LIP_MM) / 2, 0, t + plate / 2))
    else:
        gap = mm(m["gapMm"])
        rounded_box("spacer", (gap, depth * 0.6, t), mm(1), "anodised-aluminium", location=(0, 0, t / 2))
        rounded_box("plate", (gap + 2 * mm(LIP_MM), depth, plate), mm(1), "anodised-aluminium",
                    location=(0, 0, t + plate / 2))
    cylinder("bolt-head", mm(BOLT_HEAD_MM), mm(5), "galvanised-steel", location=(0, 0, t + plate + mm(2.5)))
    add_port("seat", (0, 0, 0), (0, 0, -1), port_type="clamp-seat")
    print(export_glb(entry["id"]))
