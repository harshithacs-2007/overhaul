"""Create a small normalized JSON bundle for OVERHAUL's engineering API.

Usage:
  python scripts/data/prepare_physics_bundle.py \
    --input <normalized-json-or-jsonl> \
    --output overhaul_physics_bundle.json \
    --subject equipment

The raw dataset stays on the user's machine. Only the selected normalized
records are exported for upload/demo use.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_records(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".jsonl":
        records = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
        return records
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("records"), list):
        return payload["records"]
    raise ValueError("Expected a JSON array or an object containing a 'records' array.")


def score(record: dict[str, Any], subject: str) -> int:
    variables = record.get("variables", {})
    if subject == "equipment":
        groups = [
            ["loadKW", "load_kw", "thermal_load_kw", "process_load_kw"],
            ["ratedCapacityKW", "rated_capacity_kw", "capacity_kw"],
            ["efficiency", "cop", "eer", "kw_per_kw"],
            ["annualHours", "annual_hours", "runtime_hours"],
            ["electricityRateINRPerKWh", "energy_rate_inr_per_kwh", "tariff_inr_per_kwh"],
        ]
    else:
        groups = [
            ["floorAreaM2", "floor_area_m2", "area_m2", "floor_area"],
            ["envelopeUA_W_per_K", "envelope_ua_w_per_k", "ua_w_per_k"],
            ["temperatureC", "temperature_c", "outdoor_temp_c", "ambient_temp_c"],
            ["hvacCapacityKW", "hvac_capacity_kw", "rated_capacity_kw", "capacity_kw"],
            ["hvacCOP", "hvac_cop", "cop"],
        ]
    return sum(any(isinstance(variables.get(key), (int, float)) for key in group) for group in groups)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--subject", choices=["building", "facility", "equipment"], required=True)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    records = load_records(args.input)
    records = [r for r in records if isinstance(r, dict)]
    records.sort(key=lambda r: score(r, args.subject), reverse=True)
    selected = records[: max(1, min(args.limit, len(records)))]

    bundle = {
        "subject": args.subject,
        "records": selected,
        "source": str(args.input),
        "recordCount": len(selected),
    }
    args.output.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"Wrote {len(selected)} records to {args.output}")


if __name__ == "__main__":
    main()
