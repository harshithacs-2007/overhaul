"""Create a small validated JSON bundle for OVERHAUL's engineering API.

The raw dataset stays on the user's machine. Only records that already expose
verified engineering quantities are eligible for a physics bundle. Static
RESCAST housing-option codes are intentionally not promoted into quantities
such as m², kW, COP, or hours without a verified mapping/codebook.
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
    return sum(
        any(isinstance(variables.get(key), (int, float)) for key in group)
        for group in groups
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--subject", choices=["building", "facility", "equipment"], required=True)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    records = [record for record in load_records(args.input) if isinstance(record, dict)]
    if not records:
        raise SystemExit("No normalized records found.")

    ranked = sorted(
        ((score(record, args.subject), index, record) for index, record in enumerate(records)),
        key=lambda item: (-item[0], item[1]),
    )

    best_score = ranked[0][0]
    if best_score == 0:
        raise SystemExit(
            "No verified engineering quantities found for this subject. "
            "This dataset is not physics-ready; create a verified field mapping "
            "before preparing a physics bundle."
        )

    selected = [item[2] for item in ranked[: max(1, min(args.limit, len(ranked)))]]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "subject": args.subject,
        "records": selected,
        "source": str(args.input),
        "recordCount": len(selected),
        "validation": {
            "bestEngineeringFieldCount": best_score,
            "physicsReady": best_score > 0,
        },
    }
    args.output.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"Wrote {len(selected)} validated records to {args.output}")


if __name__ == "__main__":
    main()
