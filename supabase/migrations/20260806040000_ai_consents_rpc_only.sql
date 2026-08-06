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

-- Read-only for clients: authenticated may SELECT their own row, full stop.
-- No INSERT/UPDATE/DELETE policy exists at all, so RLS default-denies those
-- outright for anon and authenticated alike — every write goes through the
-- two SECURITY DEFINER RPCs below, which enforce auth.uid() themselves and
-- never take a client-supplied user_id or consent_version. service_role
-- bypasses RLS as usual (same as every other table in this schema) and
-- needs no explicit policy.
create policy "Users can read their own AI consent"
on public.ai_consents for select to authenticated
using (user_id = auth.uid());

-- Always grants the CURRENT version, hardcoded here — never something the
-- caller supplies. Bumping the required consent version is therefore a
-- reviewed migration, not a runtime input. Idempotent: safe to call again
-- (e.g. re-accepting after a revoke, or after a version bump).
create or replace function public.accept_ai_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  -- Keep in sync with AI_CONSENT_VERSION in src/lib/finance/aiConsent.ts.
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

revoke all on function public.accept_ai_consent() from public;
revoke all on function public.accept_ai_consent() from anon;
grant execute on function public.accept_ai_consent() to authenticated;

revoke all on function public.revoke_ai_consent() from public;
revoke all on function public.revoke_ai_consent() from anon;
grant execute on function public.revoke_ai_consent() to authenticated;
