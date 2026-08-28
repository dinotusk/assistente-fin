-- Test-only migration (P4-ASSISTANT-FOUNDATION), applied exclusively to the disposable
-- Testcontainers PostgreSQL instance — never the real Supabase schema. Mirrors
-- supabase/migrations/20260806040000_ai_consents_rpc_only.sql and
-- 20260806020000_ai_rate_limit.sql closely enough to prove AiConsentGate/AiRateLimiter's real
-- SQL against a real Postgres, trimmed of RLS/grants (this backend connects directly, same
-- posture as V2/V3 — see AbstractIntegrationTest).
create table ai_consents (
  user_id uuid primary key,
  consent_version integer not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table ai_rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create function check_and_log_ai_rate_limit(
  p_user_id uuid,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  delete from ai_rate_limit_events
  where user_id = p_user_id
    and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
  from ai_rate_limit_events
  where user_id = p_user_id
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_requests then
    return false;
  end if;

  insert into ai_rate_limit_events (user_id) values (p_user_id);
  return true;
end;
$$;
