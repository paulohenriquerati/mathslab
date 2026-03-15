-- Add is_guest flag to distinguish guest sessions from authenticated ones.
alter table public.math_sessions
  add column if not exists is_guest boolean not null default true;

-- Fast index for TTL cleanup queries.
create index if not exists math_sessions_guest_ttl_idx
  on public.math_sessions (is_guest, created_at)
  where is_guest = true;

-- ──────────────────────────────────────────────────────────────────
-- pg_cron cleanup (Supabase Pro / paid plans only).
-- On the Free tier this extension may not exist; the DO block
-- silently skips it so the migration still applies cleanly.
-- ──────────────────────────────────────────────────────────────────
do $$
begin
  -- Try to enable the extension.  Fails silently if not available.
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron not available on this plan – skipping cron setup';
    return;
  end;

  -- Remove any existing job with the same name before re-creating it.
  perform cron.unschedule('cleanup-guest-sessions')
    where exists (
      select 1 from cron.job where jobname = 'cleanup-guest-sessions'
    );

  -- Run every minute: delete guest rows older than 5 minutes.
  perform cron.schedule(
    'cleanup-guest-sessions',
    '* * * * *',
    $$
      delete from public.math_sessions
      where is_guest = true
        and created_at < now() - interval '5 minutes';
    $$
  );
end;
$$;
