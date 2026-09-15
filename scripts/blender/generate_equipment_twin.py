"""Generate recognizable, editable equipment geometry for an OVERHAUL twin.

This is a visualization/export layer. Engineering truth stays in the semantic
model and performance model. The script creates simple parametric components
from evidence-derived equipment_class and dimensions, and stores all source
metadata as Blender custom properties.

Example:
  blender -b --python scripts/blender/generate_equipment_twin.py -- \
    --class chiller --input twin.json --output chiller.blend
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


def box(name: str, loc, scale):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cyl(name: str, loc, radius, depth, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return obj


def annotate(obj, node: dict):
    obj["overhaul_id"] = str(node.get("id", obj.name))
    obj["overhaul_category"] = "equipment"
    obj["overhaul_equipment_class"] = str(node.get("equipmentClass", "other"))
    obj["overhaul_model"] = str(node.get("model", "unknown"))
    obj["overhaul_status"] = str(node.get("status", "unknown"))
    obj["overhaul_confidence"] = float(node.get("confidence", 0))
    obj["overhaul_signals"] = json.dumps(node.get("signals", {}))


def create_machine(node: dict, equipment_class: str):
    root = box("OVERHAUL_EQUIPMENT", (0, 0, 0.9), (2.4, 1.35, 0.9))
    annotate(root, node)

    if equipment_class in {"chiller", "air-conditioner", "refrigeration"}:
        for x in (-1.35, 0, 1.35):
            fan = cyl(f"fan_{x}", (x, -1.43, 1.05), 0.48, 0.18, rotation=(1.5708, 0, 0))
            annotate(fan, node)
        pipe_a = cyl("refrigerant_pipe_a", (-1.8, 0, 0.25), 0.12, 2.0, rotation=(0, 1.5708, 0))
        pipe_b = cyl("refrigerant_pipe_b", (1.8, 0, 0.25), 0.12, 2.0, rotation=(0, 1.5708, 0))
        annotate(pipe_a, node); annotate(pipe_b, node)
    elif equipment_class == "compressor":
        body = cyl("compressor_body", (0, 0, 1.45), 0.75, 1.7)
        annotate(body, node)
        motor = cyl("motor", (0, 0, 2.75), 0.62, 1.1)
        annotate(motor, node)
        for x in (-0.9, 0.9):
            leg = box(f"mount_{x}", (x, 0, 0.35), (0.15, 0.55, 0.35))
            annotate(leg, node)
    elif equipment_class == "pump":
        motor = cyl("pump_motor", (-0.7, 0, 1.55), 0.62, 1.6, rotation=(0, 1.5708, 0))
        impeller = cyl("pump_impeller", (0.75, 0, 1.55), 0.78, 0.45, rotation=(0, 1.5708, 0))
        suction = cyl("suction_pipe", (0.75, -1.05, 1.55), 0.24, 1.8, rotation=(1.5708, 0, 0))
        discharge = cyl("discharge_pipe", (0.75, 1.05, 1.55), 0.24, 1.8, rotation=(1.5708, 0, 0))
        for obj in (motor, impeller, suction, discharge): annotate(obj, node)
    elif equipment_class == "fan-motor":
        motor = cyl("fan_motor", (0, 0, 1.65), 0.65, 1.7, rotation=(0, 1.5708, 0))
        annotate(motor, node)
        for i in range(6):
            blade = box(f"blade_{i}", (0, 0, 2.8), (0.12, 0.95, 0.06))
            blade.rotation_euler[2] = i * 1.0472
            annotate(blade, node)
    elif equipment_class == "boiler":
        vessel = cyl("boiler_vessel", (0, 0, 1.7), 1.15, 2.6, rotation=(0, 1.5708, 0))
        burner = cyl("burner", (1.45, 0, 1.7), 0.45, 0.35, rotation=(0, 1.5708, 0))
        stack = cyl("stack", (0, 0, 3.45), 0.28, 1.5)
        for obj in (vessel, burner, stack): annotate(obj, node)
    else:
        for i, z in enumerate((1.3, 2.25)):
            component = box(f"component_{i}", (0, 0, z), (1.55, 0.85, 0.22))
            annotate(component, node)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--class", dest="equipment_class", required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    clear_scene()
    create_machine(payload, args.equipment_class)
    bpy.context.scene["overhaul_equipment_class"] = args.equipment_class
    bpy.context.scene["overhaul_source"] = args.input.name
    bpy.context.scene["overhaul_schema"] = "OVERHAUL equipment twin 1.0"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
    print(f"OVERHAUL equipment twin written to {args.output}")


if __name__ == "__main__":
    main()
