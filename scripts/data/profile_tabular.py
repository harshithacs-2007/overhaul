#!/usr/bin/env python3
"""Profile a local tabular dataset before engineering mappings are accepted.

Outputs headers, row count, missingness, numeric ranges, and conservative alias
matches. It never changes the source file and never claims a unit from a name.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

from adapter_profiles import profile_fields


def read_table(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path, nrows=None)
    if suffix == ".xlsx":
        return pd.read_excel(path)
    if suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported tabular format: {path.suffix}")


def summarize(frame: pd.DataFrame, profile: str | None) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for column in frame.columns:
        series = frame[column]
        numeric = pd.to_numeric(series, errors="coerce")
        non_null = int(series.notna().sum())
        entry: dict[str, Any] = {
            "dtype": str(series.dtype),
            "rows": int(len(series)),
            "nonNull": non_null,
            "missingFraction": float(1 - (non_null / len(series))) if len(series) else 0.0,
            "unique": int(series.nunique(dropna=True)),
        }
        if numeric.notna().any():
            entry["numeric"] = {
                "min": float(numeric.min()),
                "max": float(numeric.max()),
                "mean": float(numeric.mean()),
            }
        fields[str(column)] = entry

    matches = profile_fields(profile, [str(c) for c in frame.columns]) if profile else {}
    return {
        "rows": int(len(frame)),
        "columns": int(len(frame.columns)),
        "headers": [str(c) for c in frame.columns],
        "fieldSummary": fields,
        "conservativeProfileMatches": matches,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--profile", choices=["nasa_power", "rescast", "lbnl_fdd", "ttm4hvac", "cu_bems", "ashrae_gepiii", "remdb"])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    frame = read_table(args.input)
    payload = {
        "dataset": args.input.name,
        "profile": args.profile,
        "analysis": summarize(frame, args.profile),
        "warnings": [
            "Column-name matches are candidate mappings only.",
            "Units must be verified from dataset documentation or file metadata before engineering use.",
            "Outliers and missingness require domain-specific review before training or simulation.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Profiled {args.input} -> {args.output}")


if __name__ == "__main__":
    main()
