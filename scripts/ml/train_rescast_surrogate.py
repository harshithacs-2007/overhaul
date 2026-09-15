"""Train an auditable RESCAST screening surrogate.

The learned model is NEVER the engineering source of truth. OVERHAUL's deterministic
physics engine remains authoritative for quantified retrofit consequences. The
surrogate is a screening / cross-check model that can be used to identify useful
pathways or missing evidence when a complete physics baseline is not yet available.

Input:
  house_features_rescast-100k.parquet (or another RESCAST-compatible table)

Output:
  public/models/rescast_surrogate.json

Design principles:
  - deterministic, reproducible split
  - group split by building id when available to reduce leakage
  - conservative quantitative feature whitelist
  - train/validation/test metrics
  - mean-baseline comparison
  - ridge regularization selected on validation data
  - missing-feature handling is surfaced as uncertainty at inference time
  - no claimed engineering units unless verified externally
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

# Only fields whose semantics are plausibly quantitative are admitted here.
# Encoded categorical codes (climate zones, wall types, HVAC type, etc.) are deliberately
# excluded rather than pretending their integer codes have linear physical meaning.
FEATURES = [
    "build_existing_model.geometry_floor_area",
    "build_existing_model.geometry_stories",
    "build_existing_model.insulation_wall",
    "build_existing_model.insulation_roof",
    "build_existing_model.insulation_ceiling",
    "build_existing_model.insulation_floor",
    "build_existing_model.window_areas",
    "build_existing_model.occupants",
    "build_existing_model.vintage",
    "build_existing_model.weather_file_latitude",
    "build_existing_model.weather_file_longitude",
]

TARGETS = {
    "hvac_load_kw": "HVAC Load",
    "electricity_total_kw": "Fuel Use: Electricity: Total",
    "total_load_kw": "Total Load",
}

GROUP_COLUMN = "bldg_id"
SEED = 42
RIDGE_LAMBDAS = (0.0, 0.01, 0.1, 1.0, 10.0, 100.0)


def pick_column(df: pd.DataFrame, target: str) -> str | None:
    if target in df.columns:
        return target
    lower = {str(c).strip().lower(): c for c in df.columns}
    return lower.get(target.strip().lower())


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def choose_features(df: pd.DataFrame, requested: Iterable[str]) -> list[str]:
    chosen: list[str] = []
    for column in requested:
        if column not in df.columns:
            continue
        numeric = pd.to_numeric(df[column], errors="coerce")
        # Require useful coverage but do not fill a missing feature with target-derived data.
        if int(numeric.notna().sum()) >= max(100, int(len(df) * 0.2)):
            chosen.append(column)
    return chosen


def split_frame(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Return boolean train/validation/test masks with a leakage-resistant group split."""
    rng = np.random.default_rng(SEED)
    if GROUP_COLUMN in df.columns:
        groups = df[GROUP_COLUMN].astype(str).fillna("missing-group")
        unique = groups.drop_duplicates().to_numpy()
        rng.shuffle(unique)
        n = len(unique)
        n_train = max(1, int(n * 0.70))
        n_val = max(1, int(n * 0.15))
        train_groups = set(unique[:n_train])
        val_groups = set(unique[n_train : n_train + n_val])
        train = groups.isin(train_groups).to_numpy()
        val = groups.isin(val_groups).to_numpy()
        test = ~(train | val)
        return train, val, test, "group-by-bldg_id"

    indices = np.arange(len(df))
    rng.shuffle(indices)
    n_train = max(1, int(len(indices) * 0.70))
    n_val = max(1, int(len(indices) * 0.15))
    train_idx = indices[:n_train]
    val_idx = indices[n_train : n_train + n_val]
    test_idx = indices[n_train + n_val :]
    train = np.zeros(len(df), dtype=bool)
    val = np.zeros(len(df), dtype=bool)
    test = np.zeros(len(df), dtype=bool)
    train[train_idx] = True
    val[val_idx] = True
    test[test_idx] = True
    return train, val, test, "row-random-fallback"


def prepare_matrix(df: pd.DataFrame, features: list[str], train_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[float], list[float]]:
    raw = np.column_stack([pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float) for column in features])
    train_values = raw[train_mask]
    means = np.nanmedian(train_values, axis=0)
    means = np.where(np.isfinite(means), means, 0.0)
    filled = np.where(np.isfinite(raw), raw, means)
    scale = np.nanstd(train_values, axis=0)
    scale = np.where(np.isfinite(scale) & (scale > 1e-9), scale, 1.0)
    standardized = (filled - means) / scale
    missing_fraction = (~np.isfinite(raw)).mean(axis=1)
    return standardized, missing_fraction, raw, means.tolist(), scale.tolist()


def fit_ridge(X: np.ndarray, y: np.ndarray, lam: float) -> tuple[float, np.ndarray]:
    Xaug = np.column_stack([np.ones(len(X)), X])
    reg = np.eye(Xaug.shape[1]) * lam
    reg[0, 0] = 0.0  # never regularize the intercept
    beta = np.linalg.solve(Xaug.T @ Xaug + reg, Xaug.T @ y)
    return float(beta[0]), beta[1:]


def predict(X: np.ndarray, intercept: float, coefficients: np.ndarray) -> np.ndarray:
    return intercept + X @ coefficients


def metrics(y: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    residual = pred - y
    mae = float(np.mean(np.abs(residual)))
    rmse = float(np.sqrt(np.mean(residual**2)))
    mean_y = float(np.mean(y))
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - mean_y) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
    return {"mae": mae, "rmse": rmse, "r2": r2}


def target_record(df: pd.DataFrame, target_name: str, requested_target: str, X: np.ndarray, missing_fraction: np.ndarray, train: np.ndarray, val: np.ndarray, test: np.ndarray, means: list[float], scale: list[float]) -> dict[str, object] | None:
    column = pick_column(df, requested_target)
    if column is None:
        return None

    y_raw = pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float)
    usable = np.isfinite(y_raw)
    train_mask = train & usable
    val_mask = val & usable
    test_mask = test & usable
    if int(train_mask.sum()) < 100 or int(val_mask.sum()) < 50 or int(test_mask.sum()) < 50:
        return None

    y_train = y_raw[train_mask]
    best = None
    best_score = float("inf")
    for lam in RIDGE_LAMBDAS:
        intercept, coefficients = fit_ridge(X[train_mask], y_train, lam)
        val_pred = predict(X[val_mask], intercept, coefficients)
        score = metrics(y_raw[val_mask], val_pred)["mae"]
        if score < best_score:
            best_score = score
            best = (lam, intercept, coefficients)
    assert best is not None
    lam, intercept, coefficients = best

    train_pred = predict(X[train_mask], intercept, coefficients)
    val_pred = predict(X[val_mask], intercept, coefficients)
    test_pred = predict(X[test_mask], intercept, coefficients)
    baseline_value = float(np.mean(y_train))
    baseline_test = np.full(int(test_mask.sum()), baseline_value, dtype=float)
    residuals = np.abs(test_pred - y_raw[test_mask])
    distance = np.sqrt(np.mean(X[test_mask] ** 2, axis=1))

    # These are screening diagnostics, not confidence intervals for an engineering quantity.
    return {
        "sourceColumn": str(column),
        "rowsUsed": int(usable.sum()),
        "splitRows": {"train": int(train_mask.sum()), "validation": int(val_mask.sum()), "test": int(test_mask.sum())},
        "selectedLambda": float(lam),
        "trainMetrics": metrics(y_raw[train_mask], train_pred),
        "validationMetrics": metrics(y_raw[val_mask], val_pred),
        "testMetrics": metrics(y_raw[test_mask], test_pred),
        "meanBaselineTestMetrics": metrics(y_raw[test_mask], baseline_test),
        "testAbsoluteResidualP50": float(np.quantile(residuals, 0.50)),
        "testAbsoluteResidualP90": float(np.quantile(residuals, 0.90)),
        "testFeatureDistanceP90": float(np.quantile(distance, 0.90)),
        "medianInputMissingFractionTrain": float(np.median(missing_fraction[train_mask])),
        "featureMean": means,
        "featureScale": scale,
        "coefficients": [float(v) for v in coefficients],
        "intercept": float(intercept),
        "targetMean": float(np.mean(y_train)),
        "targetStd": float(np.std(y_train) or 1.0),
        "screeningUseOnly": True,
        "unitStatus": "not verified by trainer; consult dataset documentation before engineering use",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/models/rescast_surrogate.json"))
    parser.add_argument("--sample", type=int, default=100000)
    args = parser.parse_args()

    dataset_hash = sha256_file(args.input)
    df = pd.read_parquet(args.input)
    if len(df) > args.sample:
        df = df.sample(args.sample, random_state=SEED).reset_index(drop=True)

    features = choose_features(df, FEATURES)
    if not features:
        raise SystemExit("No conservative quantitative RESCAST features were found.")

    train, val, test, splitMethod = split_frame(df)
    X, missing_fraction, _raw, feature_mean, feature_scale = prepare_matrix(df, features, train)

    records: dict[str, object] = {
        "schemaVersion": "1.1",
        "trainingDataset": args.input.name,
        "trainingDatasetSha256": dataset_hash,
        "sourceRowsSampled": int(len(df)),
        "sourceFeatures": features,
        "featureSemantics": "conservative quantitative fields only; encoded categorical integer codes excluded",
        "splitMethod": splitMethod,
        "randomSeed": SEED,
        "method": "standardized-ridge-regression-with-validation-selection",
        "targets": {},
        "screeningDisclaimer": "This learned surrogate is for screening/cross-checking only. OVERHAUL deterministic physics remains authoritative for retrofit consequences, energy savings, and engineering decisions.",
    }

    targets = records["targets"]
    for name, requested_target in TARGETS.items():
        record = target_record(df, name, requested_target, X, missing_fraction, train, val, test, feature_mean, feature_scale)
        if record is not None:
            targets[name] = record

    if not targets:
        raise SystemExit("No target had enough usable rows for train/validation/test evaluation.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"trained RESCAST screening surrogates -> {args.output}")
    print(json.dumps(records["targets"], indent=2))


if __name__ == "__main__":
    main()
