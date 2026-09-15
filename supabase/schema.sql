-- Overhaul Supabase schema
-- Service-role writes are used by the server persistence route. Keep RLS enabled so
-- direct client access remains closed unless an explicit policy is added later.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('building', 'facility', 'equipment')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_scope_idx on public.projects (scope);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('building', 'facility', 'equipment')),
  name text not null,
  model jsonb not null default '{}'::jsonb,
  geometry jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_project_id_idx on public.assets (project_id);

create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  kind text not null,
  name text not null,
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists evidence_project_id_idx on public.evidence (project_id);
create index if not exists evidence_asset_id_idx on public.evidence (asset_id);
create unique index if not exists evidence_project_source_ref_uidx
  on public.evidence (project_id, source_ref)
  where source_ref is not null;

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  evidence_id uuid references public.evidence(id) on delete set null,
  field text not null,
  value_numeric double precision,
  value_text text,
  unit text,
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  source_type text not null default 'evidence',
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists observations_project_id_idx on public.observations (project_id);
create index if not exists observations_asset_id_idx on public.observations (asset_id);
create index if not exists observations_evidence_id_idx on public.observations (evidence_id);

-- Climate cache (keyed by location round) to avoid repeat Open-Meteo calls.
create table if not exists public.climate_cache (
  id uuid primary key default gen_random_uuid(),
  location_key text not null,
  latitude double precision not null,
  longitude double precision not null,
  kind text not null check (kind in ('current', 'future_2035')),
  outdoor_temp_c double precision not null,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (location_key, kind)
);

create index if not exists climate_cache_fetched_at_idx on public.climate_cache (fetched_at desc);

-- User retrofit sessions (scoped to auth.uid()).
create table if not exists public.retrofit_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  input jsonb not null,
  result_today jsonb,
  result_2035 jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retrofit_sessions_user_id_idx on public.retrofit_sessions (user_id);

-- Anonymous rate-limit bucket (server writes with service role only).
create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null,
  window_start timestamptz not null,
  hit_count int not null default 0,
  unique (bucket_key, window_start)
);

-- Protect all persistence tables from direct browser access. The server uses
-- Supabase service role, which bypasses RLS.
alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.evidence enable row level security;
alter table public.observations enable row level security;
alter table public.climate_cache enable row level security;
alter table public.retrofit_sessions enable row level security;
alter table public.api_rate_limits enable row level security;

-- Public read of non-sensitive climate cache only.
drop policy if exists "climate_cache_select_all" on public.climate_cache;
create policy "climate_cache_select_all"
  on public.climate_cache for select
  using (true);

-- Authenticated users retain ownership of retrofit_sessions.
drop policy if exists "retrofit_sessions_select_own" on public.retrofit_sessions;
create policy "retrofit_sessions_select_own"
  on public.retrofit_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "retrofit_sessions_insert_own" on public.retrofit_sessions;
create policy "retrofit_sessions_insert_own"
  on public.retrofit_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "retrofit_sessions_update_own" on public.retrofit_sessions;
create policy "retrofit_sessions_update_own"
  on public.retrofit_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "retrofit_sessions_delete_own" on public.retrofit_sessions;
create policy "retrofit_sessions_delete_own"
  on public.retrofit_sessions for delete
  using (auth.uid() = user_id);

-- No policies for projects/assets/evidence/observations/api_rate_limits:
-- service-role operations remain the only write/read path for assessment data.