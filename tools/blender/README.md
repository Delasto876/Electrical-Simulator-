# Blender part models (headless)

Fixed-shape parts (MC4 connectors, inverters, breakers, batteries, enclosures,
clamps, …) are modelled by Python scripts run in **headless Blender** through
the `bpy` wheel, and exported to `apps/web/public/models/*.glb`. The exports
are committed, so the web app and CI never need Blender (DECISIONS D-004).

## Setup (once)

```bash
python3.13 -m venv tools/blender/.venv
tools/blender/.venv/bin/pip install -r tools/blender/requirements.txt
```

`bpy` 5.2.x needs exactly Python 3.13. Or point `BLENDER_PYTHON` at any Python
that can `import bpy`.

## Build

```bash
pnpm models             # every tools/blender/parts/*.py
pnpm models test_cube   # one script
```

`build_all.py` fails if a glb is over the 512 KiB budget.

## Conventions (the web loader depends on these)

- Metres, +Z up in Blender (exported as glTF +Y up).
- Origin at the part's mounting face.
- Ports: Empties made with `lib.common.add_port()`. They carry a `port_id`
  custom property plus `type`, `polarity`, `gender`; local +Z points out of
  the port. Ids and types must match the catalog entry's `ports`.
- Materials: Principled BSDF presets from `lib.common.MATERIALS` only.
- No live modifiers: apply them (the exporter also applies on export).
