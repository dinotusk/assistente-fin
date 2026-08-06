-- Distributed rate limiting for the Gemini chat route. Replaces the previous
-- in-memory Map (per-instance, reset on cold start) with a Postgres-backed
-- counter so the limit holds across serverless instances/deploys.

create table public.ai_rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_rate_limit_events_user_time_idx
  on public.ai_rate_limit_events (user_id, created_at desc);

alter table public.ai_rate_limit_events enable row level security;
-- Deliberately no policies for `authenticated`/`anon`: only the server-side
-- service role (which bypasses RLS) is meant to touch this table, via the
-- RPC below. Clients never read or write it directly.

-- Atomically prunes expired events, counts events still inside the window,
-- and — only if under the limit — logs the new event, all in one statement
-- execution. The advisory lock serializes concurrent calls for the same
-- user so two simultaneous requests can't both read "under limit" before
-- either has inserted (the race the old in-memory Map was also exposed to).
create or replace function public.check_and_log_ai_rate_limit(
  p_user_id uuid,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  delete from public.ai_rate_limit_events
  where user_id = p_user_id
    and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
  from public.ai_rate_limit_events
  where user_id = p_user_id
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_requests then
    return false;
  end if;

  insert into public.ai_rate_limit_events (user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from public;
grant execute on function public.check_and_log_ai_rate_limit(uuid, integer, integer) to service_role;
