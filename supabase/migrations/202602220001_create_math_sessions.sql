create extension if not exists pgcrypto;

create table if not exists public.math_sessions (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  score integer not null default 0,
  accuracy numeric(5,2) not null default 0,
  best_streak integer not null default 0,
  correct_answers integer not null default 0,
  total_attempts integer not null default 0,
  duration_seconds integer not null default 90,
  average_response_ms integer not null default 0,
  operation_set text[] not null default '{}',
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists math_sessions_score_idx
  on public.math_sessions (score desc, created_at desc);

create index if not exists math_sessions_created_at_idx
  on public.math_sessions (created_at desc);

alter table public.math_sessions enable row level security;

create policy "Public can read math leaderboard"
on public.math_sessions
for select
using (true);
