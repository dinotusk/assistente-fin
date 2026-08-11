-- P0-05B round 2.1: the context sent to the AI became selective per question
-- (see src/lib/finance/aiRequestValidation.ts) and, for the first time, can
-- include fields the original consent copy (version 1) never described: a
-- priority's saved amount/progress, a full per-category spend breakdown, and
-- a bill's dueDate. Bumping the required consent version forces every user
-- who already consented under v1 to see and accept the updated copy before
-- their next Gemini call — the mechanism the original migration
-- (20260806040000_ai_consents_rpc_only.sql) was built to support, per its own
-- v_current_version comment — rather than editing that historical migration.
--
-- Redefines only the function body. CREATE OR REPLACE FUNCTION preserves the
-- function's existing grants/revokes from 20260806040000 (same name+signature
-- means the same object, so its ACL is untouched) — this migration contains
-- no grant, revoke, alter table, or policy statement, which is itself the
-- proof that RLS, table privileges, and the auth.uid()-scoped RPC security
-- established by the original migration are left exactly as they were.
--
-- v_current_version must stay equal to AI_CONSENT_VERSION in
-- src/lib/finance/aiConsent.ts — enforced by aiSupabaseMigrations.test.ts.
create or replace function public.accept_ai_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version constant integer := 2;
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
