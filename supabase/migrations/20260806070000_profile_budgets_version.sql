-- P0-02C: optimistic concurrency for profile_budgets.
-- Adds only a version column — the existing composite primary key
-- (month_id, profile_id) is preserved exactly as-is, since it already
-- correctly identifies "this profile's budget for this month" and no
-- synthetic id is needed. Mirrors the P0-02A migration for
-- expenses/priorities/finance_months: constant default, additive, no data
-- touched, no RLS change (the existing "Members manage profile budgets"
-- policy is column-agnostic), no downtime, no other table touched.

begin;

alter table public.profile_budgets
  add column if not exists version integer not null default 1;

comment on column public.profile_budgets.version is
  'Optimistic concurrency token. A conditional UPDATE/DELETE (month_id + profile_id + version) affecting 0 rows means another write happened first. See expenses.version for the same pattern.';

commit;
