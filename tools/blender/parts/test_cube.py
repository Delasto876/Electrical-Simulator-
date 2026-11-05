"""Phase 0 pipeline check: a bevelled 0.4 m cube with a port marker.

Proves headless bpy -> glb -> three.js works end to end (materials, extras,
named port empties). Replaced by real parts from Phase 2 onwards.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.common import add_port, export_glb, reset_scene, rounded_box  # noqa: E402

reset_scene()
rounded_box("body", (0.4, 0.4, 0.4), radius=0.03, mat="anodised-aluminium", location=(0, 0, 0.2))
rounded_box("stripe", (0.41, 0.41, 0.06), radius=0.005, mat="accent-orange", location=(0, 0, 0.2))
add_port("top", (0, 0, 0.4), (0, 0, 1), port_type="ground-point", polarity="PE")
print(export_glb("test-cube"))
