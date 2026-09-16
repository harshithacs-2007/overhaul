# OVERHAUL validation report

## Scope

This report separates **software correctness** from **AI perception accuracy**. A passing deterministic test suite does not prove that a vision model correctly identifies arbitrary real-world equipment.

## Current automated evidence

The GitHub Actions production gate runs, in order:

1. `npm install --no-audit --no-fund`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm test`
5. `npm run build`
6. `npm run smoke`

The engineering regression suite covers building, equipment, retrofit-counterfactual, input-validation, provenance, dataset, interoperability, and controlled-fixture integrity. The pre-fixture-integrity baseline was **54/54 tests**; the added fixture-integrity suite contains five additional checks, so the current suite is expected to cover **59 tests** when the latest CI run completes.

The smoke test starts the compiled Next.js server and checks these routes:

- `/`
- `/assessment`
- `/validation`
- `/report`
- `/results`

It also verifies the no-AI deterministic equipment twin path and the evidence API's invalid-input guard.

## Controlled fixtures

`tests/fixtures/` contains labelled, synthetic references whose ground truth is fixed before running OVERHAUL:

| Fixture | Intended use | Ground truth available |
| --- | --- | --- |
| `room-hvac.svg` | room/HVAC object inventory + visible geometry labels | yes |
| `pump-skid.svg` | industrial pump/motor inventory + operating labels | yes |
| `chiller-plant.svg` | chiller/pump/cooling-tower topology | yes |
| `pump-timeseries.csv` | repeated engineering measurements and dataset statistics | yes |
| `engineering-cases.json` | deterministic physics and input edge cases | yes |

These are **controlled test fixtures**, not evidence of field performance.

## Metrics to record for vision evaluation

For each fixture and each model/configuration, record the raw output before calculating metrics.

### Object detection

- True positives, false positives, false negatives
- Precision = TP / (TP + FP)
- Recall = TP / (TP + FN)
- F1 = 2PR / (P + R)

### Geometry

For each dimension with an independently labelled metric value:

- absolute error = `|prediction - ground_truth|`
- relative error = `absolute_error / |ground_truth|`

Do not score photo-only geometry as metric accuracy unless the test image contains an independent scale reference.

### Numeric extraction

For visible labels/nameplates:

- exact-value accuracy
- unit accuracy
- MAE for numeric quantities
- MAPE only where the ground truth is non-zero

A model response with an unsupported number is treated as an extraction error, not as a useful estimate.

### Deterministic engineering calculations

Compare OVERHAUL outputs with independently calculated fixture ground truth from `engineering-cases.json`. These checks are appropriate for software correctness because the formulas and expected values are fixed independently of the UI output.

## Known limitations

- The synthetic SVG fixtures intentionally simplify real-world appearance. They are useful for regression and workflow testing, not for claiming real-world camera accuracy.
- Live multimodal extraction depends on the configured provider and available API quota. A provider failure must be reported as an unavailable perception result, never silently converted into fabricated engineering observations.
- Metric 3D reconstruction from photos alone remains relative-only unless a trustworthy scale anchor is supplied.
- A dataset correlation is descriptive association; it is not evidence that a retrofit caused the observed change.

## Demo dataset values

For a reproducible pump test, use `tests/fixtures/pump-timeseries.csv`. The intended facts are:

- 10 hourly observations
- power range: 14.8–18.0 kW
- flow range: 0.021–0.025 m³/s
- discharge pressure range: 420–430 kPa
- suction pressure range: 180–186 kPa

The correct test procedure is to upload the fixture, capture the extracted observations/statistics, and record the actual UI result. Do not change the fixture or expected values after seeing OVERHAUL's output.

## Reporting rule

For a competition deck, present two separate numbers:

1. **Software validation:** deterministic regression result from the fixed test suite.
2. **Vision validation:** measured precision/recall/numeric/geometry metrics on the labelled fixture set, with sample count and failure cases.

Do not combine these into one headline "AI accuracy" percentage.
