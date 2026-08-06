-- 1) Per-user AI consent, persisted server-side so /api/gemini-chat can enforce
--    it directly instead of trusting a client-controlled localStorage flag,
--    which a direct API call bypasses entirely.
--
-- Deliberately stores nothing about *what* was asked or answered — only that
-- consent for a given policy version was granted/revoked, and when.
create table public.ai_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consent_version integer not null check (consent_version > 0),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.ai_consents enable row level security;

-- A user may only ever read or write their own consent row — nothing here
-- lets one user see or change another's.
create policy "Users manage their own AI consent"
on public.ai_consents for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 2) Harden check_and_log_ai_rate_limit (introduced in
--    20260806020000_ai_rate_limit.sql): empty search_path with every
--    reference schema-qualified, so nothing it calls can be shadowed by an
--    object created in a schema earlier on some caller's search_path — the
--    standard SECURITY DEFINER hardening. Behavior is unchanged; this is a
--    create-or-replace of the same function signature, not a new migration
--    that touches already-applied data.
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

-- Explicit per-role revokes (not just PUBLIC) so the intent is unambiguous
-- and doesn't depend on anon/authenticated never having received a direct
-- grant some other way.
revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from public;
revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from anon;
revoke all on function public.check_and_log_ai_rate_limit(uuid, integer, integer) from authenticated;
grant execute on function public.check_and_log_ai_rate_limit(uuid, integer, integer) to service_role;
