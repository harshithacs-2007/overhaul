"""Train lightweight engineering surrogates from the team's RESCAST parquet dataset.

This intentionally does NOT fine-tune a foundation model. It fits deployable, auditable
numeric surrogate models to real RESCAST observations so the web app can use learned
relationships without replacing the deterministic physics layer.

Expected input: house_features_rescast-100k.parquet
Outputs: public/models/rescast_surrogate.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

FEATURES = [
    "build_existing_model.geometry_floor_area",
    "build_existing_model.geometry_stories",
    "build_existing_model.geometry_wall_type",
    "build_existing_model.geometry_wall_exterior_finish",
    "build_existing_model.insulation_wall",
    "build_existing_model.insulation_roof",
    "build_existing_model.insulation_ceiling",
    "build_existing_model.insulation_floor",
    "build_existing_model.window_areas",
    "build_existing_model.windows",
    "build_existing_model.orientation",
    "build_existing_model.occupants",
    "build_existing_model.hvac_cooling_type",
    "build_existing_model.vintage",
    "build_existing_model.weather_file_latitude",
    "build_existing_model.weather_file_longitude",
]

TARGETS = {
    "hvac_load_kw": "HVAC Load",
    "electricity_total_kw": "Fuel Use: Electricity: Total",
    "total_load_kw": "Total Load",
}


def pick_column(df: pd.DataFrame, target: str) -> str | None:
    if target in df.columns:
        return target
    lower = {str(c).strip().lower(): c for c in df.columns}
    return lower.get(target.strip().lower())


def numeric_frame(df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    out = {}
    for column in columns:
        if column not in df.columns:
            continue
        values = pd.to_numeric(df[column], errors="coerce")
        if values.notna().sum() < 100:
            continue
        out[column] = values
    return pd.DataFrame(out)


def fit_linear(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    mean = np.nanmean(X, axis=0)
    scale = np.nanstd(X, axis=0)
    scale = np.where(scale < 1e-9, 1.0, scale)
    Xs = (X - mean) / scale
    Xaug = np.column_stack([np.ones(len(Xs)), Xs])
    beta, *_ = np.linalg.lstsq(Xaug, y, rcond=None)
    pred = Xaug @ beta
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
    return mean, scale, r2


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/models/rescast_surrogate.json"))
    parser.add_argument("--sample", type=int, default=50000)
    args = parser.parse_args()

    df = pd.read_parquet(args.input)
    if len(df) > args.sample:
        df = df.sample(args.sample, random_state=42)

    Xdf = numeric_frame(df, FEATURES)
    if Xdf.empty:
        raise SystemExit("No usable RESCAST feature columns were found.")

    records: dict[str, object] = {
        "schemaVersion": "1.0",
        "trainingDataset": args.input.name,
        "sourceRowsSampled": int(len(df)),
        "sourceFeatures": list(Xdf.columns),
        "targets": {},
        "method": "standardized-ordinary-least-squares",
        "note": "Learned from real RESCAST observations; use only as a surrogate. Deterministic physics remains authoritative.",
    }

    for name, requested_target in TARGETS.items():
        column = pick_column(df, requested_target)
        if column is None:
            continue
        y = pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float)
        mask = np.isfinite(y)
        X = Xdf.to_numpy(dtype=float)
        mask &= np.isfinite(X).all(axis=1)
        if int(mask.sum()) < 100:
            continue
        mean, scale, r2 = fit_linear(X[mask], y[mask])
        beta_mean, beta_scale, _ = fit_linear(X[mask], y[mask])
        Xs = (X[mask] - beta_mean) / beta_scale
        Xaug = np.column_stack([np.ones(len(Xs)), Xs])
        beta, *_ = np.linalg.lstsq(Xaug, y[mask], rcond=None)
        records["targets"][name] = {
            "sourceColumn": column,
            "rowsUsed": int(mask.sum()),
            "r2": round(float(r2), 5),
            "featureMean": [float(v) for v in beta_mean],
            "featureScale": [float(v) for v in beta_scale],
            "coefficients": [float(v) for v in beta[1:]],
            "intercept": float(beta[0]),
            "targetMean": float(np.mean(y[mask])),
            "targetStd": float(np.std(y[mask]) or 1.0),
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"trained RESCAST surrogates -> {args.output}")
    print(json.dumps(records["targets"], indent=2))


if __name__ == "__main__":
    main()
