#!/usr/bin/env python3
"""Normalize CSV/XLSX/Parquet tables into OVERHAUL's canonical long form.

The output keeps source provenance and does not assign engineering meaning to a
column unless a mapping is supplied. Numerical interpretation belongs to the
engineering layer.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd


def read_table(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".xlsx":
        return pd.read_excel(path)
    if suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported tabular format: {path.suffix}")


def coerce_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)


def normalize(path: Path, dataset_id: str, mapping: dict[str, str] | None) -> list[dict[str, Any]]:
    frame = read_table(path)
    records: list[dict[str, Any]] = []
    for index, row in frame.iterrows():
        variables: dict[str, Any] = {}
        provenance: list[dict[str, str]] = []
        for source_field, raw_value in row.items():
            target_field = mapping.get(str(source_field), str(source_field)) if mapping else str(source_field)
            variables[target_field] = coerce_value(raw_value)
            provenance.append({
                "sourcePath": str(path),
                "sourceField": str(source_field),
                "confidence": "measured",
            })
        records.append({
            "datasetId": dataset_id,
            "sourceRow": int(index) + 1,
            "variables": variables,
            "provenance": provenance,
        })
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--mapping", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    mapping = None
    if args.mapping:
        mapping = json.loads(args.mapping.read_text(encoding="utf-8"))
        if not isinstance(mapping, dict):
            raise SystemExit("Mapping file must be a JSON object of source column -> canonical field")

    records = normalize(args.input, args.dataset_id, mapping)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() == ".jsonl":
        with args.output.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    else:
        args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Normalized {len(records)} rows from {args.input} -> {args.output}")


if __name__ == "__main__":
    main()
