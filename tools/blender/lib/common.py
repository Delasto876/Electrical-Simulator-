"""Shared helpers for headless Blender (bpy) part scripts.

Conventions every exported model follows (the web loader relies on them):
  * Units: metres. Blender scene unit scale = 1.0.
  * Axes: glTF is +Y up; the exporter converts from Blender's +Z up (export_yup).
  * Origin: the part's mounting face (back of an inverter, bottom of a clamp...).
  * Ports: an Empty placed at the port, its local +Z axis pointing out of the
    port, carrying custom properties ``port_id``, ``type`` and optionally
    ``polarity`` / ``gender``. They are exported as glTF ``extras`` and must
    match the catalog entry. The loader keys on ``port_id`` (not the node name:
    three.js GLTFLoader strips characters such as ':' '.' '/' from names). The
    Empty is named ``port_<id>`` only for readability in Blender.
  * Materials: Principled BSDF only (maps cleanly to glTF PBR).
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy

REPO_ROOT = Path(__file__).resolve().parents[3]
MODELS_DIR = REPO_ROOT / "apps" / "web" / "public" / "models"

# PBR material presets (base colour sRGB 0..1, metallic, roughness).
# Values are visual approximations, not measured BRDFs.
MATERIALS: dict[str, tuple[tuple[float, float, float], float, float]] = {
    "anodised-aluminium": ((0.80, 0.81, 0.83), 1.0, 0.35),
    "black-frame": ((0.03, 0.03, 0.035), 0.8, 0.40),
    "copper": ((0.95, 0.55, 0.35), 1.0, 0.25),
    "tinned-copper": ((0.82, 0.82, 0.80), 1.0, 0.30),
    "insulation-red": ((0.70, 0.04, 0.04), 0.0, 0.55),
    "insulation-black": ((0.02, 0.02, 0.02), 0.0, 0.55),
    "galvanised-steel": ((0.62, 0.64, 0.66), 1.0, 0.50),
    "pvc-grey": ((0.55, 0.56, 0.57), 0.0, 0.60),
    "enclosure-white": ((0.92, 0.92, 0.90), 0.0, 0.45),
    "accent-orange": ((0.96, 0.55, 0.10), 0.0, 0.45),
}


def reset_scene() -> None:
    """Start from an empty scene with metre units."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def material(name: str) -> bpy.types.Material:
    """Get or create a Principled BSDF material from the MATERIALS presets."""
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    color, metallic, roughness = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def rounded_box(name: str, size: tuple[float, float, float], radius: float, mat: str,
                location: tuple[float, float, float] = (0.0, 0.0, 0.0), segments: int = 3) -> bpy.types.Object:
    """Box of `size` (x, y, z metres) with bevelled edges, applied (no live modifiers)."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if radius > 0:
        bevel = obj.modifiers.new("bevel", "BEVEL")
        bevel.width = radius
        bevel.segments = segments
        bevel.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(material(mat))
    return obj


def add_port(port_id: str, location: tuple[float, float, float], direction: tuple[float, float, float],
             port_type: str, polarity: str | None = None, gender: str | None = None) -> bpy.types.Object:
    """Add a port marker Empty whose local +Z points along `direction`."""
    empty = bpy.data.objects.new(f"port_{port_id}", None)
    empty.empty_display_type = "SINGLE_ARROW"
    empty.empty_display_size = 0.02
    empty.location = location
    from mathutils import Vector
    empty.rotation_mode = "QUATERNION"
    empty.rotation_quaternion = Vector(direction).normalized().to_track_quat("Z", "Y")
    empty["port_id"] = port_id
    empty["type"] = port_type
    if polarity is not None:
        empty["polarity"] = polarity
    if gender is not None:
        empty["gender"] = gender
    bpy.context.scene.collection.objects.link(empty)
    return empty


def export_glb(filename: str) -> Path:
    """Export the whole scene to apps/web/public/models/<filename>.glb."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out = MODELS_DIR / f"{filename}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,  # carries port custom properties
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    return out


def deg(d: float) -> float:
    return math.radians(d)
