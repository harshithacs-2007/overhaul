-- Overhaul Supabase schema
-- Run in Supabase SQL editor. Enable RLS on every table.

-- Climate cache (keyed by location round) to avoid repeat Open-Meteo calls
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

alter table public.climate_cache enable row level security;

-- Public read of climate cache (non-sensitive weather aggregates)
create policy "climate_cache_select_all"
  on public.climate_cache for select
  using (true);

-- Writes only via service role (no insert/update/delete policies for anon/authenticated)

-- User retrofit sessions (scoped to auth.uid())
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

alter table public.retrofit_sessions enable row level security;

create policy "retrofit_sessions_select_own"
  on public.retrofit_sessions for select
  using (auth.uid() = user_id);

create policy "retrofit_sessions_insert_own"
  on public.retrofit_sessions for insert
  with check (auth.uid() = user_id);

create policy "retrofit_sessions_update_own"
  on public.retrofit_sessions for update
  using (auth.uid() = user_id);

create policy "retrofit_sessions_delete_own"
  on public.retrofit_sessions for delete
  using (auth.uid() = user_id);

-- Anonymous rate-limit bucket (server writes with service role only)
create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null,
  window_start timestamptz not null,
  hit_count int not null default 0,
  unique (bucket_key, window_start)
);

alter table public.api_rate_limits enable row level security;
-- No policies for anon — service role bypasses RLS for rate limiting
