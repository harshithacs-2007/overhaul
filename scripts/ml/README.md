# OVERHAUL model training

OVERHAUL separates **perception**, **learned screening**, and **engineering truth**.

Perception models extract facts from photos, PDFs and uploaded datasets. Learned surrogates identify useful patterns or help screen an intervention when a full deterministic baseline is incomplete. The deterministic engineering core remains authoritative for thermal load, equipment power, retrofit consequences, savings and decision gates.

## RESCAST static building model

The project's `house_features_rescast-100k.parquet` is a static building-feature table with 104,423 prepared records. It is useful for building-context screening, but it does **not** by itself constitute a measured energy target table. The trainer only admits explicitly numeric fields whose semantics are safe enough for quantitative treatment: stories, unit counts, bedrooms, and weather-file latitude/longitude. Encoded categories such as insulation level, HVAC type, climate-zone class and binned floor area are excluded from linear arithmetic treatment. citeturn861424search2

```powershell
python scripts\ml\train_rescast_surrogate.py "C:\Users\Welcome\Downloads\Dataset\buildings\house_features_rescast-100k.parquet" --output public\models\rescast_surrogate.json
```

The trainer records the exact input SHA-256, uses a deterministic seed (`42`), prefers a grouped `bldg_id` split when available, performs train-only imputation, selects ridge regularization on validation data, compares the held-out model against a mean baseline, and exports P50/P90 residual and feature-distance diagnostics. A missing target causes a clean training failure rather than a fabricated model.

## RESCAST time-series model

The RESCAST release also contains a much larger 15-minute time-series dataset. Its documented schema includes `Time`, `building_id`, total electricity load, conditioned-space temperature, heating/cooling setpoints, outdoor dry/wet-bulb temperature, relative humidity, wind speed and solar radiation. citeturn861424search0turn861424search2

Use the dedicated trainer when the time-series shards are available locally:

```powershell
python scripts\ml\train_rescast_timeseries_surrogate.py "C:\path\to\RESCAST-100k\timeseries" --output public\models\rescast_timeseries_surrogate.json
```

This pipeline samples a deterministic subset of parquet **fragments and row groups** rather than scanning the full corpus, then engineers weather/setpoint/time features and evaluates a `building_id`-grouped 70/15/15 split. The public release is about 3.66 billion time-series rows, so row-group sampling is a deliberate scalability guard. citeturn861424search5

The learned model predicts the dataset-native electricity-load target as a **screening model**. It is not a retrofit savings calculator. The exported artifact includes train/validation/test counts, held-out metrics, mean-baseline comparison, feature normalization and provenance; the runtime loader reports screening quality and never replaces deterministic engineering outputs.

## Dataset-backed engineering rules

A dataset mean, P95, trend, correlation or range is evidence about the uploaded sample. It is not automatically a design condition, annual baseline, rated value or retrofit saving. OVERHAUL keeps these concepts separate in both the prompt layer and deterministic engineering layer.

When timestamps are present, ingestion records the observed time window and median sampling interval so the application can distinguish a short sample from a longer operating history. Descriptive correlations are presented as associations only; they are not treated as causal retrofit effects.

## Equipment models

`train_equipment_surrogates.py` expects a real measured equipment dataset and only learns from rows explicitly marked healthy/normal/baseline. It groups by `equipment_id` when available and refuses to claim a trained model when there are not enough usable observations.

Do not ship an equipment fault/efficiency model based on synthetic labels. A production model requires a real labeled dataset, identity-safe held-out evaluation, documented feature/target semantics and a reproducible model artifact.

## Model release checklist

Before committing a trained artifact:

1. Record dataset ID and SHA-256 (or source shard manifest for a multi-file corpus).
2. Verify non-empty train/validation/test splits with identity-safe separation.
3. Confirm held-out metrics improve meaningfully over the baseline.
4. Verify target units against dataset documentation.
5. Review residual and out-of-distribution behavior.
6. Keep the model explicitly screening/cross-check only; deterministic engineering remains authoritative.

A missing model artifact is preferable to a fabricated one. The application must continue to work using deterministic physics when no learned model is present.
