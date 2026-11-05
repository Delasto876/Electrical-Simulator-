"""MC4-style connector halves (male = pin, female = socket).

Frame: origin at the mating face, Blender +Z (glTF +Y) points out of the
connector toward its mate; the cable enters from −Z. The web app places one
at each cable end aligned with the route.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.common import add_port, cylinder, export_glb, mm, reset_scene  # noqa: E402

for gender in ("male", "female"):
    reset_scene()
    cylinder("cable-boot", mm(5), mm(20), "insulation-black", (0, 0, -mm(50)))
    cylinder("nut", mm(8.5), mm(14), "insulation-black", (0, 0, -mm(34)), vertices=6)
    cylinder("body", mm(8), mm(26), "insulation-black", (0, 0, -mm(14)))
    if gender == "male":
        # plug: sleeve with the pin inside, two locking fingers
        cylinder("sleeve", mm(6.5), mm(10), "insulation-black", (0, 0, mm(4)))
        cylinder("pin", mm(2), mm(12), "tinned-copper", (0, 0, mm(5)))
    else:
        cylinder("nose", mm(5.5), mm(16), "insulation-black", (0, 0, mm(7)))
        cylinder("socket", mm(2.6), mm(2), "tinned-copper", (0, 0, mm(15)))
    add_port("mate", (0, 0, 0), (0, 0, 1), port_type="mc4", gender=gender)
    print(export_glb(f"generic-mc4-{gender}"))
