"""Train a compact, exportable RESCAST time-series screening model.

The public RESCAST-100k release contains a massive 15-minute building-energy
series alongside static house features. This trainer samples rows from parquet
shards, builds physically meaningful weather/setpoint/time features, and fits a
standardized ridge model. It never uses building_id as a predictive feature.

The artifact is a screening model for expected electrical load. It is not a
replacement for calibrated simulation, measurement or the deterministic
OVERHAUL engineering core.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.dataset as ds

SEED = 42
MAX_ROWS = 500_000
BASE_COLUMNS = [
    "Weather: Drybulb Temperature",
    "Weather: Wetbulb Temperature",
    "Weather: Relative Humidity",
    "Weather: Wind Speed",
    "Weather: Diffuse Solar Radiation",
    "Weather: Direct Solar Radiation",
    "Temperature: Conditioned Space",
    "Temperature: Heating Setpoint",
    "Temperature: Cooling Setpoint",
]
TARGET = "Fuel Use: Electricity: Total"
TIME_COLUMN = "Time"
GROUP_COLUMN = "building_id"


def reservoir_sample(dataset: ds.Dataset, columns: list[str], max_rows: int, seed: int) -> pd.DataFrame:
    """Uniformly reservoir-sample rows across all parquet fragments without loading the full series."""
    rng = np.random.default_rng(seed)
    sample: list[tuple] = []
    seen = 0
    for batch in dataset.to_batches(columns=columns, batch_size=65_536):
        frame = batch.to_pandas()
        for row in frame.itertuples(index=False, name=None):
            seen += 1
            if len(sample) < max_rows:
                sample.append(row)
            else:
                j = int(rng.integers(0, seen))
                if j < max_rows:
                    sample[j] = row
    return pd.DataFrame(sample, columns=columns)


def build_features(frame: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    time = pd.to_datetime(frame[TIME_COLUMN], errors="coerce")
    hour = time.dt.hour.fillna(0).to_numpy() + time.dt.minute.fillna(0).to_numpy() / 60.0
    day = time.dt.dayofyear.fillna(1).to_numpy()
    base_names = [c for c in BASE_COLUMNS if c in frame.columns]
    if not base_names:
        raise SystemExit("No RESCAST weather/setpoint columns were found.")
    base = np.column_stack([pd.to_numeric(frame[c], errors="coerce").to_numpy(dtype=float) for c in base_names])
    pieces = [base]
    names = list(base_names)
    pieces += [np.sin(2 * np.pi * hour / 24)[:, None], np.cos(2 * np.pi * hour / 24)[:, None]]
    names += ["hour_sin", "hour_cos"]
    pieces += [np.sin(2 * np.pi * day / 365.25)[:, None], np.cos(2 * np.pi * day / 365.25)[:, None]]
    names += ["day_sin", "day_cos"]
    if "Weather: Drybulb Temperature" in base_names and "Temperature: Cooling Setpoint" in base_names:
        t = base[:, base_names.index("Weather: Drybulb Temperature")]
        sp = base[:, base_names.index("Temperature: Cooling Setpoint")]
        pieces.append(np.maximum(t - sp, 0)[:, None]); names.append("cooling_degree")
    if "Weather: Drybulb Temperature" in base_names and "Temperature: Heating Setpoint" in base_names:
        t = base[:, base_names.index("Weather: Drybulb Temperature")]
        sp = base[:, base_names.index("Temperature: Heating Setpoint")]
        pieces.append(np.maximum(sp - t, 0)[:, None]); names.append("heating_degree")
    if "Weather: Relative Humidity" in base_names and "Weather: Drybulb Temperature" in base_names:
        rh = base[:, base_names.index("Weather: Relative Humidity")]
        t = base[:, base_names.index("Weather: Drybulb Temperature")]
        pieces.append((rh * t)[:, None]); names.append("rh_x_drybulb")
    return np.column_stack(pieces), names


def split_by_building(frame: pd.DataFrame, seed: int):
    rng = np.random.default_rng(seed)
    ids = frame[GROUP_COLUMN].astype(str)
    unique = ids.drop_duplicates().to_numpy()
    rng.shuffle(unique)
    n = len(unique)
    train_n = max(1, int(n * 0.70))
    val_n = max(1, int(n * 0.15))
    train_ids = set(unique[:train_n]); val_ids = set(unique[train_n:train_n + val_n])
    train = ids.isin(train_ids).to_numpy(); val = ids.isin(val_ids).to_numpy(); test = ~(train | val)
    return train, val, test


def fit_ridge(x: np.ndarray, y: np.ndarray, alpha: float):
    mean = np.nanmedian(x, axis=0); mean = np.where(np.isfinite(mean), mean, 0.0)
    filled = np.where(np.isfinite(x), x, mean)
    scale = np.nanstd(filled, axis=0); scale = np.where(np.isfinite(scale) & (scale > 1e-9), scale, 1.0)
    xs = (filled - mean) / scale
    aug = np.column_stack([np.ones(len(xs)), xs])
    reg = np.eye(aug.shape[1]) * alpha; reg[0, 0] = 0.0
    beta = np.linalg.solve(aug.T @ aug + reg, aug.T @ y)
    return mean, scale, beta


def predict(x: np.ndarray, mean: np.ndarray, scale: np.ndarray, beta: np.ndarray):
    filled = np.where(np.isfinite(x), x, mean)
    return beta[0] + ((filled - mean) / scale) @ beta[1:]


def metric(y: np.ndarray, p: np.ndarray):
    err = p - y
    mae = float(np.mean(np.abs(err))); rmse = float(np.sqrt(np.mean(err**2)))
    ss_tot = float(np.sum((y - np.mean(y))**2))
    r2 = 1.0 - float(np.sum((y - p)**2)) / ss_tot if ss_tot > 1e-12 else 0.0
    return {"mae": mae, "rmse": rmse, "r2": r2}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("timeseries_dir", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/models/rescast_timeseries_surrogate.json"))
    parser.add_argument("--sample", type=int, default=MAX_ROWS)
    args = parser.parse_args()

    dataset = ds.dataset(args.timeseries_dir, format="parquet")
    available = set(dataset.schema.names)
    required = [TIME_COLUMN, GROUP_COLUMN, TARGET]
    missing = [name for name in required if name not in available]
    if missing: raise SystemExit(f"RESCAST time-series dataset is missing required columns: {missing}")
    columns = [name for name in [TIME_COLUMN, GROUP_COLUMN, TARGET, *BASE_COLUMNS] if name in available]
    frame = reservoir_sample(dataset, columns, min(args.sample, MAX_ROWS), SEED)
    if frame.empty: raise SystemExit("No time-series rows were available for training.")
    y = pd.to_numeric(frame[TARGET], errors="coerce").to_numpy(dtype=float)
    valid = np.isfinite(y); frame = frame.loc[valid].reset_index(drop=True); y = y[valid]
    if len(frame) < 1_000: raise SystemExit("Too few valid target rows for a useful time-series surrogate.")

    x, feature_names = build_features(frame)
    train, val, test = split_by_building(frame, SEED)
    if train.sum() < 500 or val.sum() < 200 or test.sum() < 200: raise SystemExit("Not enough distinct buildings for grouped train/validation/test evaluation.")

    best = None
    for alpha in [0.01, 0.1, 1.0, 10.0, 100.0]:
        mean, scale, beta = fit_ridge(x[train], y[train], alpha)
        score = metric(y[val], predict(x[val], mean, scale, beta))["mae"]
        if best is None or score < best[0]: best = (score, alpha, mean, scale, beta)
    assert best is not None
    _score, selected_alpha, feature_mean, feature_scale, beta = best
    test_pred = predict(x[test], feature_mean, feature_scale, beta)
    baseline = np.full(int(test.sum()), float(np.mean(y[train])))
    artifact = {
        "schemaVersion": "rescast-timeseries-1.0",
        "trainingDataset": args.timeseries_dir.name,
        "sampleRows": int(len(frame)),
        "featureNames": feature_names,
        "target": TARGET,
        "targetUnit": "dataset-native; verify against RESCAST metadata before engineering use",
        "splitMethod": "building_id-grouped 70/15/15",
        "randomSeed": SEED,
        "selectedAlpha": float(selected_alpha),
        "trainRows": int(train.sum()), "validationRows": int(val.sum()), "testRows": int(test.sum()),
        "testMetrics": metric(y[test], test_pred), "meanBaselineTestMetrics": metric(y[test], baseline),
        "screeningUseOnly": True, "engineeringAuthority": "deterministic_physics_and_measured_site_data",
        "featureMean": feature_mean.tolist(), "featureScale": feature_scale.tolist(),
        "intercept": float(beta[0]), "coefficients": beta[1:].tolist(),
        "note": "Learned expected-load screen from weather, setpoints and time. Not a retrofit savings calculator.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(json.dumps({k: artifact[k] for k in ["trainingDataset", "sampleRows", "trainRows", "validationRows", "testRows", "testMetrics", "meanBaselineTestMetrics", "selectedAlpha"]}, indent=2))


if __name__ == "__main__": main()
