# OVERHAUL

**OVERHAUL is a universal retrofit intelligence engine for buildings, facilities, and equipment.** Its primary job is to determine **which retrofit intervention is justified, what it will change before money is spent, how confident that prediction is, and whether the implemented result matches the model.**

RCA, data collection, digital twins, diagnostics, and computer vision are supporting layers. The product outcome is the **retrofit decision**.

The product is **evidence-first and engineering-constrained**. AI/ML components may assist perception, surrogate modeling, or orchestration, but the application does not treat an AI-generated number as an engineering fact. Deterministic physics, explicit reference data, provenance, uncertainty, and evidence gates remain the basis for decision-critical calculations.

## Product flow

`SEE → UNDERSTAND → MODEL → COMPARE → DIAGNOSE → SIMULATE → OPTIMIZE → DECIDE → IMPLEMENT → VERIFY → LEARN`

The key loop is:

`REAL ASSET → EVIDENCE → BASELINE → RETROFIT OPTIONS → WHAT-IF SIMULATION → TRADE-OFFS → DECISION → VERIFY`

### Core retrofit capabilities

- Evidence-first intake for buildings, facilities, machinery, and equipment
- Retrofit-oriented digital twin / digital shadow reconstruction
- Current vs counterfactual retrofit comparison in an interactive 3D workspace
- Deterministic building thermal-load and HVAC simulation
- Deterministic equipment power, runtime, capacity, and efficiency simulation
- Coupled envelope + HVAC reasoning
- Root-cause analysis used to explain why a retrofit is or is not justified
- Evidence-backed retrofit candidate generation and intervention scoring
- Economics, sensitivity, uncertainty, portfolio optimization, and decision provenance
- Measure-and-verify workflow for post-implementation reality checks
- Dataset adapters for climate, building, HVAC/FDD, retrofit, materials, and geometry sources
- RESCAST surrogate infrastructure where a trained/calibrated model is appropriate
- Audit-oriented provenance and uncertainty handling
- Parametric Blender/CAD interoperability with OBJ, DXF footprint, and OVERHAUL semantic manifest exports
- Presentation-mode synthetic building and machinery demonstrations that are explicitly labeled as demo data

## Geometry and BIM/CAD interoperability

OVERHAUL separates **semantic engineering identity** from visualization geometry. The asset twin exposes metric geometry only when width, depth, and height are evidenced or explicitly supplied. Missing geometry stays visibly unresolved rather than being fabricated.

The interchange layer exports:

- **OBJ** — explicit parametric geometry suitable for Blender inspection and downstream mesh workflows
- **DXF** — metric footprint geometry suitable for CAD drafting workflows
- **OVERHAUL manifest JSON** — asset class, dimensions, engineering parameters, evidence IDs, coordinate convention, and provenance

The manifest is the continuity layer for a future IFC/BIM adapter: the engineering model is not reduced to an untraceable mesh when it leaves OVERHAUL.

## Data grounding

The repository contains dataset manifests and conservative engineering adapters rather than pretending raw datasets are bundled into the web application. Current adapter coverage includes NASA POWER climate data, LBNL FDD HVAC datasets, RESCAST building data, and REMDB retrofit/economic data.

Source records are promoted into engineering quantities only when their semantics and units are explicit. Encoded categorical fields are not silently interpreted as SI measurements, and missing engineering inputs block calculations instead of being fabricated.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Supabase for persistent project/evidence/engineering memory where configured
- Three.js for the in-browser interactive 3D engineering workspace
- Framer Motion
- Vitest
- Cloudflare Workers / Pages deployment flow

## Setup

1. Copy `.env.example` to `.env.local` and configure Supabase values when persisted services are required.
2. Run the required Supabase schema in the Supabase SQL editor when database-backed features are enabled.
3. Run `npm install`.
4. Run `npm run dev`.

## Engineering architecture

Pure engineering functions live under `src/lib/engineering/`, with dataset normalization and adapters under `src/lib/data/`. The application keeps evidence acquisition, asset modeling, reference expectations, simulation, diagnostics, economics, and provenance as separable layers so individual calculations can be tested and audited.

The UI is intentionally **retrofit-first**: users should provide the least information necessary to establish a defensible baseline, see candidate intervention consequences, compare current vs counterfactual states, and proceed toward implementation and verification.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm test` — calculation and engineering unit tests
- `npm run lint` — ESLint checks
- `npm run train:rescast` — train the RESCAST surrogate when the required local dataset/training inputs are available
