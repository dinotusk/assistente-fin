-- Fixes an active production privilege gap in check_and_log_ai_rate_limit
-- (introduced in 20260806020000_ai_rate_limit.sql). Confirmed live via
-- has_function_privilege(): anon and authenticated currently have EXECUTE on
-- this function, because Supabase grants EXECUTE on every new public-schema
-- function directly to anon/authenticated/service_role by default — revoking
-- from PUBLIC alone (as the original migration did) does not remove a grant
-- that was never routed through PUBLIC in the first place.
--
-- Because the function is SECURITY DEFINER and owned by postgres (which has
-- rolbypassrls = true), any anon caller — no session required, just the
-- public anon key — can invoke it with an arbitrary p_user_id and it
-- actually writes to ai_rate_limit_events, bypassing that table's RLS
-- entirely. That's a live, unauthenticated, cross-user rate-limit
-- manipulation / denial-of-service vector: anyone can exhaust another
-- user's AI assistant rate limit without ever logging in.
--
-- This is a create-or-replace of the same signature introduced in
-- 20260806020000_ai_rate_limit.sql (not a rewrite of an already-applied
-- migration), isolated into its own file so it can be applied immediately
-- without waiting on the consent-RPC work in 20260806040000.
create or replace function public.check_and_log_ai_rate_limit(
  p_user_id uuid,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));

  delete from public.ai_rate_limit_events
  where user_id = p_user_id
    and created_at < pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);

  select pg_catalog.count(*) into v_count
  from public.ai_rate_limit_events
  where user_id = p_user_id
    and created_at >= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);

  if v_count >= p_max_requests then
    return false;
  end if;

  insert into public.ai_rate_limit_events (user_id) values (p_user_id);
  return true;
end;
$$;

-- Explicit per-role revokes (not just PUBLIC) — confirmed necessary above,
-- not merely defensive. grant to service_role only.
revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from public;
revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from anon;
revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from authenticated;
grant execute on function public.check_and_log_ai_rate_limit(uuid, integer, integer) to service_role;
