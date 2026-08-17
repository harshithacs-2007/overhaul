# Overhaul

Deterministic (non-AI, physics-based) retrofit decision engine that ranks envelope and HVAC retrofit actions together using real formulas and cited engineering data.

**No ML / AI model is used anywhere in this project.**

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + RLS) for climate cache
- Framer Motion
- Deploy: Vercel

## Setup

1. Copy `.env.example` to `.env.local` and fill in Supabase values (optional for local climate fallback).
2. Run `supabase/schema.sql` in your Supabase SQL editor.
3. `npm install && npm run dev`

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL (prefer pooler / Supavisor) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Anon key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Climate cache writes; never expose to client |

## Calculation engine

All pure functions live in `src/lib/calculations/` — no UI dependencies. Pipeline: thermal load → HVAC verdict → savings/payback → ranked actions → optional 2035 CMIP6 re-run.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm test` — calculation unit tests
