# OVERHAUL competition-readiness checklist

## Verified on GitHub

Latest verified commit before this document is `d2d6210e7bbe1f94fc61c503de0d8d96f96c0943`.

- `npm run lint` — PASS, 0 errors; 57 non-blocking warnings remain.
- `npx tsc --noEmit` — PASS.
- `npm test` — PASS, 59/59 tests across 12 files.
- `npm run build` — PASS.
- `npm run smoke` — PASS for five app routes plus deterministic twin, invalid evidence input, and deterministic dataset extraction.
- Netlify configuration — present in `netlify.toml`.
- Vercel is not part of the application build workflow.

## Product behaviour the judges should see

1. Start in Building mode for an office/HVAC walkthrough or Industry / asset mode for a pump/chiller.
2. Use the controlled fixture pack or real evidence.
3. Show the evidence shelf and the evidence-health state rather than hiding failed perception.
4. Show the twin only after geometry is established; keep photo-only geometry relative-only.
5. Open the engineering anchor gate and enter known values instead of allowing the system to guess.
6. Compare current and retrofit counterfactual states.
7. Show the provenance trail and next-evidence requirements.
8. Export the semantic/metric model where supported.
9. Use the report workflow for the final engineering summary.

## What must not be claimed

- Do not claim a universal real-world CV accuracy percentage from synthetic fixtures.
- Do not claim that a short time series proves annual savings.
- Do not claim a photo proves hidden efficiency, capacity, pressure, temperature or wear.
- Do not present descriptive correlation as causation.
- Do not present a visual condition as a confirmed failure without corroborating evidence.

## Judge-facing differentiator

The defensible story is not “AI generates a 3D model.” It is:

> **OVERHAUL turns fragmented asset evidence into an evidence-weighted engineering twin, then runs retrofit counterfactuals with provenance and verification gates.**

The strongest demo is therefore an end-to-end chain where every important number can be traced to a source, explicit input, deterministic formula, or clearly labelled model output.

## Remaining validation gate before a field-accuracy claim

Run the exact same evaluation protocol on an independent set of real photographs/nameplates/technical documents with frozen ground truth. Record raw outputs before computing precision, recall, F1, numeric MAE/MAPE, geometry error, and failure cases. That field set should be separate from the controlled synthetic fixtures.
