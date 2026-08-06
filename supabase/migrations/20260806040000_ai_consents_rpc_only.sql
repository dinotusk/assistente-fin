-- Per-user AI consent, persisted server-side so /api/gemini-chat can enforce
-- it directly instead of trusting a client-controlled localStorage flag.
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

-- Every new table in this project gets full table privileges (SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) granted to PUBLIC, anon and
-- authenticated by default (confirmed live via pg_default_acl — the same
-- mechanism that caused the check_and_log_ai_rate_limit privilege gap fixed
-- in 20260806030000). RLS with only a SELECT policy already denies writes in
-- effect, but that safety depends entirely on RLS staying enabled — the raw
-- grant would still be live underneath it. Revoking explicitly here removes
-- that single point of fragility instead of relying on it.
revoke all on table public.ai_consents from public;
revoke all on table public.ai_consents from anon;
revoke all on table public.ai_consents from authenticated;

-- Clients may only ever read their own row via this grant + the policy below
-- (the grant says "SELECT is possible at all"; the policy says "only your
-- own row"). No INSERT/UPDATE/DELETE grant exists for authenticated at
-- all — not even one RLS would otherwise have to deny — so every write must
-- go through the two SECURITY DEFINER RPCs, which enforce auth.uid()
-- themselves and never take a client-supplied user_id or consent_version.
grant select on table public.ai_consents to authenticated;

-- service_role bypasses RLS already, but (per the same default-ACL finding
-- above) needs its own explicit grant to actually touch the table — nothing
-- here should depend on what the project's defaults happen to be. Limited to
-- the CRUD it plausibly needs for support/LGPD operations, not table-level
-- administration (TRUNCATE, REFERENCES, TRIGGER are not granted).
grant select, insert, update, delete on table public.ai_consents to service_role;

create policy "Users can read their own AI consent"
on public.ai_consents for select to authenticated
using (user_id = auth.uid());

-- Always grants the CURRENT version, hardcoded here — never something the
-- caller supplies. Bumping the required consent version is therefore a
-- reviewed migration, not a runtime input. Idempotent: safe to call again
-- (e.g. re-accepting after a revoke, or after a version bump).
--
-- v_current_version must stay equal to AI_CONSENT_VERSION in
-- src/lib/finance/aiConsent.ts — enforced by a test
-- (aiSupabaseMigrations.test.ts) that reads both and fails the build if they
-- drift, not by convention alone.
create or replace function public.accept_ai_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version constant integer := 1;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.ai_consents (user_id, consent_version, accepted_at, revoked_at)
  values (v_user_id, v_current_version, pg_catalog.now(), null)
  on conflict (user_id) do update
    set consent_version = v_current_version,
        accepted_at = pg_catalog.now(),
        revoked_at = null;
end;
$$;

-- Revokes only the caller's own consent (auth.uid(), not a parameter) — there
-- is no way to pass a target user id, so this can never touch anyone else's row.
create or replace function public.revoke_ai_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.ai_consents
  set revoked_at = pg_catalog.now()
  where user_id = v_user_id;
end;
$$;

-- Explicit revoke from every role, including service_role: service_role
-- manages ai_consents via its own direct table grant above, not through
-- these end-user self-service RPCs, and default privileges are not trusted
-- to have left it out on their own (see the pg_default_acl finding above —
-- service_role gets EXECUTE on new functions by default too).
revoke all on function public.accept_ai_consent() from public;
revoke all on function public.accept_ai_consent() from anon;
revoke all on function public.accept_ai_consent() from authenticated;
revoke all on function public.accept_ai_consent() from service_role;
grant execute on function public.accept_ai_consent() to authenticated;

revoke all on function public.revoke_ai_consent() from public;
revoke all on function public.revoke_ai_consent() from anon;
revoke all on function public.revoke_ai_consent() from authenticated;
revoke all on function public.revoke_ai_consent() from service_role;
grant execute on function public.revoke_ai_consent() to authenticated;
