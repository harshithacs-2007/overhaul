"""Train portable healthy-performance surrogates for equipment classes.

Input is an engineer-provided, real measured dataset (CSV/Parquet). This script
DOES NOT invent fault data. It learns healthy operating relationships from rows
labelled healthy and exports a small JSON model for browser/Node inference.

Expected canonical columns when available:
  equipment_class, operating_state, capacity_kw, power_kw, flow_m3h,
  pressure_bar, ambient_temp_c, supply_temp_c, return_temp_c, speed_rpm

The model is intentionally auditable: normalized polynomial features + ridge
least squares. Train/test splitting is grouped by equipment_id when present to
reduce identity leakage.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

BASE_FEATURES = [
    "capacity_kw",
    "flow_m3h",
    "pressure_bar",
    "ambient_temp_c",
    "supply_temp_c",
    "return_temp_c",
    "speed_rpm",
]

TARGETS = ["power_kw", "efficiency"]


def read_table(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    raise SystemExit("Input must be CSV or Parquet.")


def finite_numeric(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    for col in columns:
        if col in df.columns:
            out[col] = pd.to_numeric(df[col], errors="coerce")
    return out


def engineer_features(x: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    cols = [c for c in BASE_FEATURES if c in x.columns]
    if not cols:
        raise SystemExit("No canonical numeric equipment features found.")
    raw = x[cols].to_numpy(dtype=float)
    names = list(cols)

    pieces = [raw]
    pieces.append(raw ** 2)
    names.extend([f"{c}__sq" for c in cols])

    if "capacity_kw" in cols and "flow_m3h" in cols:
        idx_c, idx_f = cols.index("capacity_kw"), cols.index("flow_m3h")
        pieces.append((raw[:, idx_c] * raw[:, idx_f])[:, None])
        names.append("capacity_kw__x__flow_m3h")
    if "ambient_temp_c" in cols and "speed_rpm" in cols:
        idx_t, idx_s = cols.index("ambient_temp_c"), cols.index("speed_rpm")
        pieces.append((raw[:, idx_t] * raw[:, idx_s])[:, None])
        names.append("ambient_temp_c__x__speed_rpm")

    return np.column_stack(pieces), names


def fit_ridge(x: np.ndarray, y: np.ndarray, alpha: float = 1e-6):
    mean = np.nanmean(x, axis=0)
    scale = np.nanstd(x, axis=0)
    scale = np.where(scale < 1e-9, 1.0, scale)
    xs = (x - mean) / scale
    xaug = np.column_stack([np.ones(len(xs)), xs])
    reg = np.eye(xaug.shape[1]) * alpha
    reg[0, 0] = 0.0
    beta = np.linalg.solve(xaug.T @ xaug + reg, xaug.T @ y)
    pred = xaug @ beta
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
    return mean, scale, beta, r2


def group_split(df: pd.DataFrame, test_fraction: float, seed: int):
    rng = np.random.default_rng(seed)
    if "equipment_id" in df.columns:
        groups = df["equipment_id"].astype(str).dropna().unique()
        rng.shuffle(groups)
        cut = max(1, int(len(groups) * (1 - test_fraction)))
        train_groups = set(groups[:cut])
        mask = df["equipment_id"].astype(str).isin(train_groups)
        return mask
    order = np.arange(len(df))
    rng.shuffle(order)
    cut = max(1, int(len(df) * (1 - test_fraction)))
    mask = np.zeros(len(df), dtype=bool)
    mask[order[:cut]] = True
    return pd.Series(mask, index=df.index)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/models/equipment_surrogates.json"))
    parser.add_argument("--test-fraction", type=float, default=0.2)
    parser.add_argument("--alpha", type=float, default=1e-6)
    args = parser.parse_args()

    df = read_table(args.input)
    if "operating_state" in df.columns:
        healthy_mask = df["operating_state"].astype(str).str.lower().isin({"healthy", "normal", "baseline"})
        df = df[healthy_mask].copy()
    if df.empty:
        raise SystemExit("No healthy/normal rows available. Provide real healthy operating observations.")

    output = {
        "schemaVersion": "equipment-surrogate-1.0",
        "trainingDataset": args.input.name,
        "healthyRows": int(len(df)),
        "method": "standardized-polynomial-ridge",
        "identitySplit": "equipment_id-grouped when available",
        "targets": {},
    }

    for equipment_class, group in df.groupby("equipment_class", dropna=False) if "equipment_class" in df.columns else [("other", df)]:
        xdf = finite_numeric(group, BASE_FEATURES)
        if "power_kw" not in group.columns and "efficiency" not in group.columns:
            continue
        x, feature_names = engineer_features(xdf)
        split = group_split(group, args.test_fraction, seed=42)
        class_key = str(equipment_class) if pd.notna(equipment_class) else "other"
        class_model = {
            "rows": int(len(group)),
            "features": feature_names,
            "targets": {},
        }

        for target in TARGETS:
            if target not in group.columns:
                continue
            y = pd.to_numeric(group[target], errors="coerce").to_numpy(dtype=float)
            valid = np.isfinite(y) & np.isfinite(x).all(axis=1)
            train = valid & split.to_numpy()
            test = valid & (~split.to_numpy())
            if train.sum() < 50:
                continue
            mean, scale, beta, train_r2 = fit_ridge(x[train], y[train], args.alpha)
            x_test = (x[test] - mean) / scale
            pred_test = np.column_stack([np.ones(test.sum()), x_test]) @ beta if test.sum() else np.array([])
            if test.sum():
                ss_res = float(np.sum((y[test] - pred_test) ** 2))
                ss_tot = float(np.sum((y[test] - np.mean(y[test])) ** 2))
                test_r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
            else:
                test_r2 = None
            class_model["targets"][target] = {
                "featureMean": mean.tolist(),
                "featureScale": scale.tolist(),
                "intercept": float(beta[0]),
                "coefficients": beta[1:].tolist(),
                "trainR2": float(train_r2),
                "testR2": None if test_r2 is None else float(test_r2),
                "trainRows": int(train.sum()),
                "testRows": int(test.sum()),
                "targetMean": float(np.mean(y[train])),
                "targetStd": float(np.std(y[train]) or 1.0),
            }

        if class_model["targets"]:
            output["targets"][class_key] = class_model

    if not output["targets"]:
        raise SystemExit("No trainable healthy equipment target was found.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
