# OVERHAUL

**OVERHAUL is a universal retrofit intelligence engine for buildings, facilities, and equipment.** It turns evidence into an engineering model, compares interventions before money is spent, explains the decision chain, and is designed to verify outcomes after implementation.

The product is **evidence-first and engineering-constrained**. AI/ML components may assist perception, surrogate modeling, or orchestration, but the application does not treat an AI-generated number as an engineering fact. Deterministic physics, explicit reference data, provenance, uncertainty, and evidence gates remain the basis for decision-critical calculations.

## Product flow

`SEE → UNDERSTAND → MODEL → COMPARE → DIAGNOSE → SIMULATE → OPTIMIZE → DECIDE → IMPLEMENT → VERIFY → LEARN`

### Core capabilities

- Evidence-first asset intake for buildings, facilities, and equipment
- Semantic asset and digital-twin reconstruction
- Expected-state vs actual-state digital shadow and residual analysis
- Evidence-backed equipment performance curves
- Fault detection and diagnostic reasoning
- Deterministic retrofit intervention simulation
- Coupled envelope + HVAC reasoning
- Economics, sensitivity, portfolio optimization, and decision provenance
- Dataset adapters for climate, building, HVAC/FDD, retrofit, materials, and geometry sources
- RESCAST surrogate infrastructure where a trained/calibrated model is appropriate
- Audit-oriented provenance and uncertainty handling
- Parametric Blender/CAD interoperability with OBJ, DXF footprint, and OVERHAUL semantic manifest exports

## Geometry and BIM/CAD interoperability

OVERHAUL separates **semantic engineering identity** from visualization geometry. The asset twin exposes a metric geometry bridge only when width, depth, and height are evidenced or explicitly supplied. Missing geometry stays visibly unresolved rather than being fabricated.

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
- Supabase for persisted climate/data services where configured
- Framer Motion
- Vitest
- Vercel

## Setup

1. Copy `.env.example` to `.env.local` and configure Supabase values when using the persisted climate services.
2. Run `supabase/schema.sql` in the Supabase SQL editor when database-backed features are required.
3. Run `npm install`.
4. Run `npm run dev`.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | RLS-scoped Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Server-side climate cache writes; never expose to the client |

## Engineering architecture

Pure engineering functions live under `src/lib/engineering/`, with dataset normalization and adapters under `src/lib/data/`. The application keeps evidence acquisition, asset modeling, reference expectations, simulation, diagnostics, economics, and provenance as separable layers so individual calculations can be tested and audited.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm test` — calculation and engineering unit tests
- `npm run lint` — ESLint checks
- `npm run train:rescast` — train the RESCAST surrogate when the required local dataset/training inputs are available
