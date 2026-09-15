"""Generate an editable Blender scene from an OVERHAUL semantic twin JSON export.

The input is intentionally semantic: spaces, envelope, HVAC, equipment and process
nodes. Blender is the geometry/rendering layer, not the source of engineering truth.
Unknown dimensions should be omitted or represented with uncertainty in the source JSON.

Usage inside Blender's Python console or background mode:
    blender -b --python scripts/blender/generate_twin.py -- --input twin.json --output twin.blend
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    import bpy
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Run this script with Blender's Python interpreter.") from exc


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def make_box(name: str, x: float, y: float, z: float, sx: float, sy: float, sz: float) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (max(sx, 0.1), max(sy, 0.1), max(sz, 0.1))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def create_node(node: dict, index: int) -> None:
    x = float(node.get("x", 0)) / 10.0
    y = float(node.get("y", 0)) / 10.0
    w = float(node.get("width", 10)) / 20.0
    h = float(node.get("height", 10)) / 20.0
    category = node.get("category", "asset")
    z = 1.0 if category in {"equipment", "hvac", "process", "utility"} else 0.15
    obj = make_box(node.get("label", f"node-{index}"), x, y, z, w, h, 0.12 if z < 1 else 0.45)
    obj["overhaul_id"] = str(node.get("id", index))
    obj["overhaul_category"] = category
    obj["overhaul_status"] = node.get("status", "unknown")
    obj["overhaul_signals"] = json.dumps(node.get("signals", []))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    clear_scene()

    collection = bpy.data.collections.new("OVERHAUL Twin")
    bpy.context.scene.collection.children.link(collection)

    for index, node in enumerate(payload.get("assets", [])):
        create_node(node, index)
        obj = bpy.context.object
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)

    bpy.context.scene["overhaul_scope"] = payload.get("scope", "unknown")
    bpy.context.scene["overhaul_industry"] = payload.get("industry", "unknown")
    bpy.context.scene["overhaul_confidence"] = float(payload.get("confidence", 0))
    bpy.context.scene["overhaul_unknowns"] = json.dumps(payload.get("unknowns", []))
    bpy.context.scene["overhaul_schema"] = "OVERHAUL semantic twin 1.0"

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.output).resolve()))
    print(f"OVERHAUL twin written to {args.output}")


if __name__ == "__main__":
    main()
