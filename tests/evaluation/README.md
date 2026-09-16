# OVERHAUL evaluation protocol

This directory is the controlled test bench for the product. It separates **software correctness**, **deterministic engineering correctness**, and **AI perception accuracy** so we never present one as another.

## 1. Workflow acceptance

Run a full assessment for each fixture and record PASS/FAIL for:

1. create assessment and choose scope;
2. upload evidence / open camera scan;
3. capture sectors and verify coverage persists;
4. continue to assessment;
5. refresh the assessment page and verify scan state remains available;
6. enter valid engineering values with decimals, commas and spaces;
7. attempt invalid numeric input and verify it is rejected without `NaN` entering the model;
8. verify deterministic calculations produce the fixture ground truth;
9. open observed/counterfactual views and verify they do not invent metric geometry;
10. generate/export the report without losing evidence.

## 2. Vision scoring

For each image fixture, compare predictions with the ground-truth classes and boxes in `golden-cases.json`.

- A class match is case-insensitive after the same canonical labels used by OVERHAUL.
- A detection is a true positive when class matches and box IoU >= 0.50.
- Precision = TP / (TP + FP).
- Recall = TP / (TP + FN).
- F1 = harmonic mean of precision and recall.
- Report per-fixture results and aggregate micro averages.

The controlled SVG fixtures are intentionally simple. They demonstrate pipeline correctness; they must **not** be described in a report as a field benchmark of real-world computer vision.

## 3. Numeric extraction scoring

For each known numeric field compare extracted value with the fixture value.

- MAE = mean absolute error.
- MAPE = mean absolute percentage error for non-zero ground-truth values.
- For ground truth equal to zero, report the absolute error and mark percentage error as undefined.
- Preserve units; a numerically close result in the wrong unit is a failure.

## 4. Physics scoring

The deterministic physics layer must reproduce the expected outputs in each golden case. This is a software regression test, not a claim that the simplified physics model represents every real asset.

For a successful run, record:

| Layer | Metric | Result |
|---|---|---|
| Workflow | End-to-end acceptance | PASS/FAIL |
| Vision | Precision | measured |
| Vision | Recall | measured |
| Vision | F1 | measured |
| Vision | mean matched-box IoU | measured |
| Numeric extraction | MAE | measured |
| Numeric extraction | MAPE | measured |
| Physics | max absolute output error | measured |
| Persistence | reload / snapshot recovery | PASS/FAIL |

## 5. Final report rules

Never substitute an expected value for a measured value. Never turn model confidence into accuracy. Keep these labels separate:

- **ground truth** — what the fixture actually contains;
- **prediction** — what the AI returned;
- **engineering output** — what the deterministic model calculated;
- **measured post-change value** — physical M&V data after a real intervention.

The final hackathon report should include fixture images, inputs, predictions, errors, failures, and the exact software revision tested.
