# OVERHAUL model training

OVERHAUL uses two different kinds of models:

1. Foundation models for perception/reasoning (vision, OCR, evidence planning).
2. Engineering surrogates calibrated on real observations. These must never replace authoritative physics when a deterministic calculation is available.

## RESCAST

The team's `house_features_rescast-100k.parquet` contains 104,423 rows and 45 columns in the current prepared dataset. Train the lightweight deployable surrogate with:

```powershell
python scripts\ml\train_rescast_surrogate.py "C:\Users\Welcome\Downloads\Dataset\buildings\house_features_rescast-100k.parquet" --output public\models\rescast_surrogate.json
```

The trainer learns relationships for HVAC load, total electrical load and total load from real RESCAST features. It writes the training dataset name, row count, feature normalization, coefficients, R² and provenance into the exported artifact.

Important: a learned surrogate is only a supplemental model. The OVERHAUL decision engine should continue to prefer measured data and deterministic thermodynamics / capacity calculations, and should expose model confidence and training provenance.

## Future equipment models

Additional real equipment datasets should enter the same pipeline with explicit dataset IDs and target definitions. Do not claim an equipment fault or efficiency model is trained until a real labeled dataset has been ingested, evaluated on a held-out split, and its metrics are stored.
