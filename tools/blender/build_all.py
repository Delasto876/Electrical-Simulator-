#!/usr/bin/env python3
"""Run every tools/blender/parts/*.py with headless Blender (bpy) and check sizes.

Python with bpy is found from $BLENDER_PYTHON, else tools/blender/.venv.
Usage:  pnpm models            (all parts)
        pnpm models test_cube  (one part)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = HERE.parents[1] / "apps" / "web" / "public" / "models"
SIZE_BUDGET_BYTES = 512 * 1024  # per glb; keep models low-poly (PLAN.md risk table)


def blender_python() -> str:
    env = os.environ.get("BLENDER_PYTHON")
    if env:
        return env
    venv = HERE / ".venv" / "bin" / "python"
    if venv.exists():
        return str(venv)
    sys.exit("No bpy Python found. See tools/blender/README.md (python3.13 -m venv tools/blender/.venv && "
             "tools/blender/.venv/bin/pip install -r tools/blender/requirements.txt)")


def main() -> int:
    wanted = set(sys.argv[1:])
    scripts = sorted(p for p in (HERE / "parts").glob("*.py") if not wanted or p.stem in wanted)
    if not scripts:
        sys.exit(f"no part scripts matched {sorted(wanted)}")
    py = blender_python()
    failed = False
    for script in scripts:
        print(f"-> {script.name}")
        result = subprocess.run([py, str(script)], capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stdout[-2000:], result.stderr[-2000:], sep="\n")
            failed = True
    for glb in sorted(MODELS.glob("*.glb")):
        size = glb.stat().st_size
        flag = "  OVER BUDGET" if size > SIZE_BUDGET_BYTES else ""
        print(f"   {glb.name:40s} {size / 1024:8.1f} KiB{flag}")
        failed |= bool(flag)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
