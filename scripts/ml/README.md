# OVERHAUL model training

OVERHAUL separates **perception**, **learned screening**, and **engineering truth**.

Perception models extract facts from photos, PDFs and uploaded datasets. Learned surrogates identify useful patterns or help screen an intervention when a full deterministic baseline is incomplete. The deterministic engineering core remains authoritative for thermal load, equipment power, retrofit consequences, savings and decision gates.

## RESCAST building model

The prepared `house_features_rescast-100k.parquet` dataset is a 104,423-row building-feature table used by the project. The trainer records the exact input file SHA-256 in its exported artifact.

```powershell
python scripts\ml\train_rescast_surrogate.py "C:\Users\Welcome\Downloads\Dataset\buildings\house_features_rescast-100k.parquet" --output public\models\rescast_surrogate.json
```

The training protocol favors auditability over a flashy score:

- deterministic random seed (`42`)
- grouped train/validation/test split by `bldg_id` when available, reducing identity leakage
- conservative quantitative feature whitelist; encoded categorical IDs are excluded from linear treatment
- train-only median imputation
- standardized ridge regression with validation-selected regularization
- held-out test metrics against a mean baseline
- P50/P90 residual and feature-distance diagnostics
- exact dataset hash and sampling metadata in the artifact
- explicit screening-only and unit-verification metadata

The runtime loader accepts the JSON artifact and exposes held-out metrics, training provenance, missing-feature count and a residual-based uncertainty range. A learned prediction must never overwrite a supplied measurement or deterministic physics output.

## Dataset-backed engineering rules

A dataset mean, P95, trend or range is evidence about the uploaded sample. It is not automatically a design condition, annual baseline, rated value or retrofit saving. OVERHAUL keeps these concepts separate in both the prompt layer and deterministic engineering layer.

When timestamps are present, ingestion records the observed time window and median sampling interval so the application can distinguish a short sample from a longer operating history.

## Equipment models

`train_equipment_surrogates.py` expects a real measured equipment dataset and only learns from rows explicitly marked healthy/normal/baseline. It groups by `equipment_id` when available and refuses to claim a trained model when there are not enough usable observations.

Do not ship an equipment fault/efficiency model based on synthetic labels. A production model requires a real labeled dataset, identity-safe held-out evaluation, documented feature/target semantics and a reproducible model artifact.

## Model release checklist

Before committing a trained artifact:

1. Record dataset ID and SHA-256.
2. Verify non-empty train/validation/test splits with identity-safe separation.
3. Confirm test metrics improve meaningfully over the mean baseline.
4. Verify target units against dataset documentation.
5. Review residual and out-of-distribution behavior.
6. Keep the model explicitly screening/cross-check only; deterministic engineering remains authoritative.

A missing model artifact is preferable to a fabricated one. The application must continue to work using deterministic physics when no learned artifact is present.
