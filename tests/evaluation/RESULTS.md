# OVERHAUL evaluation results

> **Status:** Template + deterministic regression baseline. Live AI perception results must be filled from an actual run; do not replace them with expected values.

**Revision tested:** `__GIT_SHA__`

**Run date:** `__DATE__`

## Test matrix

| Case | Scope | Evidence | Workflow | Vision precision | Vision recall | Vision F1 | Mean IoU | Numeric MAE | Numeric MAPE | Physics max abs error |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| building-envelope-01 | building | room-hvac-ground-truth.svg | __ | __ | __ | __ | __ | __ | __ | __ |
| pump-vfd-01 | equipment | pump-room-ground-truth.svg | __ | __ | __ | __ | __ | __ | __ | __ |
| chiller-plant-01 | facility | chiller-plant-ground-truth.svg | __ | __ | __ | __ | __ | __ | __ | __ |

## Deterministic regression baseline

The physics engine is expected to reproduce the golden-case calculations within the test tolerance. Record the CI run as PASS/FAIL rather than converting this into an AI “accuracy” percentage.

| Case | Expected output | Measured output | Absolute error |
|---|---:|---:|---:|
| building-envelope-01 thermal load | 7.5 kW | __ | __ |
| building-envelope-01 retrofit thermal load | 6.8 kW | __ | __ |
| building-envelope-01 annual energy saving | 466.6667 kWh/yr | __ | __ |
| building-envelope-01 annual cost saving | ₹4,200/yr | __ | __ |
| pump-vfd-01 baseline power | 50 kW | __ | __ |
| pump-vfd-01 retrofit power | 40 kW | __ | __ |
| pump-vfd-01 annual energy saving | 30,000 kWh/yr | __ | __ |
| pump-vfd-01 annual cost saving | ₹300,000/yr | __ | __ |
| chiller-plant-01 baseline thermal load | 2.42 kW | __ | __ |
| chiller-plant-01 baseline electrical power | 0.636842 kW | __ | __ |
| chiller-plant-01 baseline annual energy | 2,228.947 kWh/yr | __ | __ |

## Workflow acceptance evidence

Record screenshots or screen recordings for each PASS/FAIL item:

| Check | Result | Evidence file / screenshot |
|---|---|---|
| Assessment creation | __ | __ |
| 12-sector capture persists | __ | __ |
| Continue to assessment works | __ | __ |
| Reload retains scan state | __ | __ |
| IndexedDB evidence survives navigation | __ | __ |
| Invalid numeric input does not enter `NaN` | __ | __ |
| Commas/spaces normalize correctly | __ | __ |
| Scientific notation parses correctly | __ | __ |
| Missing engineering anchors gate the model | __ | __ |
| Relative-only geometry remains unverified | __ | __ |
| Observed/counterfactual visual switches work | __ | __ |
| Report export preserves source/evidence trace | __ | __ |

## Vision test protocol

Run the **actual** `/api/vision/room-scan` pipeline on the fixture images. Store the returned detection payload beside the run record. Compare it with `golden-cases.json`.

A matched detection requires:

1. canonicalized class label match; and
2. bounding-box IoU >= 0.50 when a ground-truth box is defined.

Then calculate per-case and micro-averaged precision, recall, and F1. Numeric fields use MAE and MAPE against the fixture values. Do not count model confidence as accuracy.

## Real-world validation

The controlled SVG fixtures are software regression tests. A separate field-validation set should contain real photographs with human-reviewed labels and, where metric geometry is claimed, independent measurements.

| Field case | Asset | Ground-truth source | Prediction | Error | Notes |
|---|---|---|---|---|---|
| field-01 | __ | __ | __ | __ | __ |

## Conclusions

Write only conclusions supported by the measured table above. Explicitly distinguish:

- software/workflow pass rate;
- deterministic engineering calculation error;
- controlled-vision fixture performance;
- real-world field performance;
- any unavailable external AI services or degraded modes.
