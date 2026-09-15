"""Train an auditable RESCAST static-feature screening surrogate.

This model is a context/screening layer only. OVERHAUL's deterministic engineering
core remains authoritative for retrofit consequences and decisions.

Input:  house_features_rescast-100k.parquet
Output: public/models/rescast_surrogate.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

# Only fields with explicitly numeric semantics in the RESCAST metadata are admitted.
# Encoded categorical fields such as insulation levels, HVAC type and climate-zone
# class are intentionally excluded from linear arithmetic treatment.
FEATURES = [
    "build_existing_model.geometry_stories",
    "build_existing_model.geometry_building_number_units_mf",
    "build_existing_model.geometry_building_number_units_sfa",
    "build_existing_model.bedrooms",
    "build_existing_model.weather_file_latitude",
    "build_existing_model.weather_file_longitude",
]
TARGETS = {"hvac_load_kw": "HVAC Load", "electricity_total_kw": "Fuel Use: Electricity: Total", "total_load_kw": "Total Load"}
GROUP_COLUMN = "bldg_id"
SEED = 42
RIDGE_LAMBDAS = (0.0, 0.01, 0.1, 1.0, 10.0, 100.0)


def pick_column(df: pd.DataFrame, target: str) -> str | None:
    if target in df.columns: return target
    lower = {str(c).strip().lower(): c for c in df.columns}
    return lower.get(target.strip().lower())


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""): digest.update(chunk)
    return digest.hexdigest()


def choose_features(df: pd.DataFrame, requested: Iterable[str]) -> list[str]:
    chosen: list[str] = []
    for column in requested:
        if column not in df.columns: continue
        numeric = pd.to_numeric(df[column], errors="coerce")
        if int(numeric.notna().sum()) >= max(100, int(len(df) * 0.2)): chosen.append(column)
    return chosen


def split_frame(df: pd.DataFrame):
    rng = np.random.default_rng(SEED)
    if GROUP_COLUMN in df.columns:
        groups = df[GROUP_COLUMN].astype(str).fillna("missing-group")
        unique = groups.drop_duplicates().to_numpy(); rng.shuffle(unique)
        n = len(unique); n_train = max(1, int(n * 0.70)); n_val = max(1, int(n * 0.15))
        train_ids = set(unique[:n_train]); val_ids = set(unique[n_train:n_train + n_val])
        train = groups.isin(train_ids).to_numpy(); val = groups.isin(val_ids).to_numpy(); test = ~(train | val)
        return train, val, test, "group-by-bldg_id"
    indices = np.arange(len(df)); rng.shuffle(indices)
    n_train = max(1, int(len(indices) * 0.70)); n_val = max(1, int(len(indices) * 0.15))
    train = np.zeros(len(df), dtype=bool); val = np.zeros(len(df), dtype=bool); test = np.zeros(len(df), dtype=bool)
    train[indices[:n_train]] = True; val[indices[n_train:n_train+n_val]] = True; test[indices[n_train+n_val:]] = True
    return train, val, test, "row-random-fallback"


def prepare_matrix(df: pd.DataFrame, features: list[str], train_mask: np.ndarray):
    raw = np.column_stack([pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float) for column in features])
    train_values = raw[train_mask]
    means = np.nanmedian(train_values, axis=0); means = np.where(np.isfinite(means), means, 0.0)
    filled = np.where(np.isfinite(raw), raw, means)
    scale = np.nanstd(train_values, axis=0); scale = np.where(np.isfinite(scale) & (scale > 1e-9), scale, 1.0)
    return (filled - means) / scale, (~np.isfinite(raw)).mean(axis=1), means.tolist(), scale.tolist()


def fit_ridge(X: np.ndarray, y: np.ndarray, lam: float):
    Xaug = np.column_stack([np.ones(len(X)), X]); reg = np.eye(Xaug.shape[1]) * lam; reg[0, 0] = 0.0
    beta = np.linalg.solve(Xaug.T @ Xaug + reg, Xaug.T @ y)
    return float(beta[0]), beta[1:]


def predict(X: np.ndarray, intercept: float, coefficients: np.ndarray): return intercept + X @ coefficients


def metrics(y: np.ndarray, pred: np.ndarray):
    residual = pred - y; mae = float(np.mean(np.abs(residual))); rmse = float(np.sqrt(np.mean(residual**2)))
    ss_res = float(np.sum((y - pred) ** 2)); ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    return {"mae": mae, "rmse": rmse, "r2": 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0}


def target_record(df, requested_target, X, missing_fraction, train, val, test, means, scale):
    column = pick_column(df, requested_target)
    if column is None: return None
    y_raw = pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float); usable = np.isfinite(y_raw)
    train_mask = train & usable; val_mask = val & usable; test_mask = test & usable
    if int(train_mask.sum()) < 100 or int(val_mask.sum()) < 50 or int(test_mask.sum()) < 50: return None
    best = None; best_score = float("inf")
    for lam in RIDGE_LAMBDAS:
        intercept, coefficients = fit_ridge(X[train_mask], y_raw[train_mask], lam)
        score = metrics(y_raw[val_mask], predict(X[val_mask], intercept, coefficients))["mae"]
        if score < best_score: best_score = score; best = (lam, intercept, coefficients)
    assert best is not None
    lam, intercept, coefficients = best
    train_pred = predict(X[train_mask], intercept, coefficients); val_pred = predict(X[val_mask], intercept, coefficients); test_pred = predict(X[test_mask], intercept, coefficients)
    baseline_test = np.full(int(test_mask.sum()), float(np.mean(y_raw[train_mask])))
    residuals = np.abs(test_pred - y_raw[test_mask]); distance = np.sqrt(np.mean(X[test_mask] ** 2, axis=1))
    return {
        "sourceColumn": str(column), "rowsUsed": int(usable.sum()),
        "splitRows": {"train": int(train_mask.sum()), "validation": int(val_mask.sum()), "test": int(test_mask.sum())},
        "selectedLambda": float(lam), "r2": float(metrics(y_raw[test_mask], test_pred)["r2"]),
        "trainMetrics": metrics(y_raw[train_mask], train_pred), "validationMetrics": metrics(y_raw[val_mask], val_pred), "testMetrics": metrics(y_raw[test_mask], test_pred),
        "meanBaselineTestMetrics": metrics(y_raw[test_mask], baseline_test),
        "testAbsoluteResidualP50": float(np.quantile(residuals, 0.50)), "testAbsoluteResidualP90": float(np.quantile(residuals, 0.90)),
        "testFeatureDistanceP90": float(np.quantile(distance, 0.90)), "medianInputMissingFractionTrain": float(np.median(missing_fraction[train_mask])),
        "featureMean": means, "featureScale": scale, "coefficients": [float(v) for v in coefficients], "intercept": float(intercept),
        "targetMean": float(np.mean(y_raw[train_mask])), "targetStd": float(np.std(y_raw[train_mask]) or 1.0),
        "screeningUseOnly": True, "unitStatus": "target unit must be verified from the supplied dataset documentation before engineering use",
    }


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("input", type=Path); parser.add_argument("--output", type=Path, default=Path("public/models/rescast_surrogate.json")); parser.add_argument("--sample", type=int, default=100000)
    args = parser.parse_args(); dataset_hash = sha256_file(args.input); df = pd.read_parquet(args.input); sampled = False
    if len(df) > args.sample: df = df.sample(args.sample, random_state=SEED).reset_index(drop=True); sampled = True
    features = choose_features(df, FEATURES)
    if not features: raise SystemExit("No conservative quantitative RESCAST static features were found.")
    train, val, test, split_method = split_frame(df); X, missing_fraction, feature_mean, feature_scale = prepare_matrix(df, features, train)
    records = {"schemaVersion":"1.1", "trainingDataset":args.input.name, "trainingDatasetSha256":dataset_hash, "sourceRowsSampled":int(len(df)), "sampledFromLargerFile":sampled, "sourceFeatures":features, "featureSemantics":"explicit numeric fields only; categorical codes excluded", "splitMethod":split_method, "randomSeed":SEED, "method":"standardized-ridge-regression-with-validation-selection", "targets":{}, "screeningDisclaimer":"Screening/cross-check only. Deterministic OVERHAUL physics remains authoritative for retrofit consequences, savings and engineering decisions."}
    for name, requested in TARGETS.items():
        record = target_record(df, requested, X, missing_fraction, train, val, test, feature_mean, feature_scale)
        if record is not None: records["targets"][name] = record
    if not records["targets"]: raise SystemExit("No target had enough usable rows for train/validation/test evaluation.")
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(records, indent=2), encoding="utf-8"); print(json.dumps(records, indent=2))


if __name__ == "__main__": main()
