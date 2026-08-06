-- Fixes the one open item from the P0-01 review: service_role ended up with
-- TRUNCATE, REFERENCES and TRIGGER on public.ai_consents, inherited from the
-- project's default ACL for new tables (20260806040000_ai_consents_rpc_only.sql
-- explicitly revoked from public/anon/authenticated before granting, but never
-- revoked service_role's default grant before adding its own narrower one —
-- so the extra privileges were just never removed). Confirmed live via
-- role_table_grants before this migration.
--
-- Does not touch policies, functions, data, or any other table.
begin;

revoke all on table public.ai_consents from service_role;
grant select, insert, update, delete on table public.ai_consents to service_role;

commit;
