"""L-feet (roof attachments with a modelUrl in roof-attachments.json).

Frame (Blender, metres): X along the rail, Y across, Z up. Origin = roof
surface under the rail centreline; the rail seat is at Z = heightMm.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.common import add_port, catalog_entries, export_glb, mm, reset_scene, rounded_box  # noqa: E402

FLANGE_MM = 5  # aluminium thickness
PAD_MM = 3     # EPDM pad under the base

for entry in catalog_entries("roof-attachments.json"):
    if not entry.get("modelUrl"):
        continue
    m = entry["mounting"]
    h = mm(m["heightMm"])
    base_len = mm(entry["dimensions"]["lengthMm"])
    width = mm(entry["dimensions"]["widthMm"])
    f = mm(FLANGE_MM)
    pad = mm(PAD_MM)
    reset_scene()
    rounded_box("pad", (base_len, width, pad), 0, "insulation-black", location=(0, -base_len / 4, pad / 2))
    rounded_box("base", (base_len, width, f), mm(1), "anodised-aluminium", location=(0, -base_len / 4, pad + f / 2))
    rounded_box("upright", (width, f, h - pad), mm(1), "anodised-aluminium", location=(0, 0, pad + (h - pad) / 2))
    if m["kind"] == "slotted-l-foot":
        rounded_box("slot-mark", (mm(8), f * 1.05, (h - pad) * 0.5), 0, "insulation-black", location=(0, 0, pad + (h - pad) * 0.55))
    add_port("anchor", (0, 0, 0), (0, 0, -1), port_type="roof-anchor")
    add_port("seat", (0, 0, h), (0, 0, 1), port_type="rail-slot")
    print(export_glb(entry["id"]))
