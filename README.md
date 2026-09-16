# OVERHAUL

**OVERHAUL is a universal retrofit intelligence engine for buildings, facilities, and equipment.** Its job is to turn real asset evidence into a defensible retrofit decision: what is known, what is uncertain, what changes under a proposed intervention, and how the result can be verified after implementation.

RCA, data collection, digital twins, diagnostics, and computer vision are supporting layers. The product outcome is the **retrofit decision**.

The product is **evidence-first and engineering-constrained**. AI/ML may assist perception, surrogate modeling, or orchestration, but decision-critical numbers are not accepted merely because a model generated them. Deterministic physics, explicit reference data, provenance, uncertainty, and evidence gates remain the basis for engineering calculations.

## Product flow

`SEE → UNDERSTAND → MODEL → COMPARE → DIAGNOSE → SIMULATE → OPTIMIZE → DECIDE → IMPLEMENT → VERIFY → LEARN`

Core loop:

`REAL ASSET → EVIDENCE → BASELINE → RETROFIT OPTIONS → WHAT-IF SIMULATION → TRADE-OFFS → DECISION → VERIFY`

## Core capabilities

- Evidence-first intake for buildings, facilities, machinery, and equipment
- Retrofit-oriented digital twin / digital shadow reconstruction
- Current vs counterfactual retrofit comparison in an interactive 3D workspace
- Deterministic building thermal-load and HVAC simulation
- Deterministic equipment power, runtime, capacity, and efficiency simulation
- Coupled envelope + HVAC reasoning
- Root-cause diagnosis and evidence-backed intervention candidates
- Economics, sensitivity, uncertainty, portfolio optimization, and decision provenance
- Measure-and-verify workflow for post-implementation checks
- Dataset adapters for climate, HVAC/FDD, retrofit, materials, and geometry data
- RESCAST surrogate infrastructure where a trained/calibrated model is appropriate
- Parametric Blender/CAD interoperability with OBJ, DXF footprint, and OVERHAUL semantic manifest exports
- Synthetic, explicitly labelled validation fixtures for controlled demos

## Geometry and interoperability

OVERHAUL separates **semantic engineering identity** from visualization geometry. Metric geometry is emitted only when dimensions are evidenced or explicitly supplied. Photo-only reconstruction remains relative rather than inventing metre-scale measurements.

Exports include:

- **OBJ** — parametric geometry for Blender and mesh workflows
- **DXF** — metric footprint geometry for CAD workflows
- **OVERHAUL manifest JSON** — asset identity, dimensions, engineering parameters, evidence IDs, coordinate convention, and provenance

## Data grounding

The repository contains conservative dataset adapters and manifests rather than pretending raw external datasets are bundled into the web application. Supported adapter families include NASA POWER climate data, LBNL FDD HVAC data, RESCAST building data, and REMDB retrofit/economic data.

Source records are promoted into engineering quantities only when their semantics and units are explicit. Missing inputs block calculations instead of being silently fabricated.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Supabase for persistent project/evidence/engineering memory where configured
- Three.js for the in-browser interactive 3D engineering workspace
- Framer Motion
- Vitest
- Netlify-compatible Next.js deployment workflow

## Setup

1. Copy `.env.example` to `.env.local` and configure Supabase values when persisted services are required.
2. Run the required Supabase schema in the Supabase SQL editor when database-backed features are enabled.
3. Run `npm install`.
4. Run `npm run dev`.

## Verification

The GitHub Actions gate runs:

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npm run smoke`

The smoke test starts the compiled production server and probes the core routes plus deterministic/invalid-input API paths. The validation lab is available at `/validation` and the reproducible fixture protocol is documented in `docs/VALIDATION_REPORT.md`.

The repository's deterministic regression suite currently validates building, equipment, retrofit-counterfactual, numeric-input, dataset, provenance, and interoperability behaviour. Vision accuracy is reported separately from software correctness and must include ground truth, sample count, failure cases, and the actual measured metrics.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm test` — engineering and regression tests
- `npm run lint` — ESLint checks
- `npm run smoke` — compiled-app HTTP smoke test
- `npm run train:rescast` — train the RESCAST surrogate when required local inputs are available
- `npm run train:rescast-timeseries` — train the RESCAST time-series surrogate when required local inputs are available
