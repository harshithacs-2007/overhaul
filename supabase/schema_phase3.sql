-- Phase 3 extensions — run after Phase 1 schema. RLS on every table.

-- Full climate context cache (JSON payload — no invented fills)
create table if not exists public.climate_context_cache (
  id uuid primary key default gen_random_uuid(),
  location_key text not null unique,
  latitude double precision not null,
  longitude double precision not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.climate_context_cache enable row level security;

create policy "climate_context_cache_select_all"
  on public.climate_context_cache for select
  using (true);

-- Engineering building models (no auth in Phase 3 — session-keyed, open insert for anon drafts)
create table if not exists public.engineering_models (
  id uuid primary key default gen_random_uuid(),
  session_key text,
  model jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engineering_models_session_key_idx
  on public.engineering_models (session_key);

alter table public.engineering_models enable row level security;

-- No anon policies for write; service role only until auth lands

-- Evidence → property links
create table if not exists public.evidence_property_links (
  id uuid primary key default gen_random_uuid(),
  evidence_id text not null,
  property_path text not null,
  target_id text,
  verification_state text not null default 'unreviewed'
    check (verification_state in ('unreviewed', 'needs_review', 'confirmed', 'rejected')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.evidence_property_links enable row level security;
