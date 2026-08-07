-- P0-02A: optimistic concurrency control groundwork.
-- Adds an integer version column to the three tables the client writes to
-- most often (expenses, priorities, finance_months). Each write that knows
-- the row's current version can condition its UPDATE/DELETE on it
-- (`where id = ? and version = ?`); zero rows affected means someone else
-- wrote to that row first, and the app layer (supabaseRepository.ts) treats
-- that as an explicit conflict rather than silently overwriting it.
--
-- `default 1 not null` is a constant default, so this is a fast metadata-only
-- change in modern Postgres (no table rewrite, no downtime). No existing row
-- is touched, none is deleted, and no RLS policy needs to change: all three
-- tables use a single `is_household_member(household_id)` policy that is
-- column-agnostic. No new index: the primary key on `id` already narrows an
-- UPDATE/DELETE to a single row, so `version` is just one extra equality
-- check evaluated against that same row.
--
-- profile_budgets is deliberately NOT included here. Its current sync
-- strategy (see syncBudgets in supabaseRepository.ts) deletes every budget
-- row for the affected months and reinserts them from scratch on every save,
-- which defeats row-level optimistic concurrency regardless of whether a
-- version column exists. Fixing that is out of scope for this step.

begin;

alter table public.expenses
  add column if not exists version integer not null default 1;

alter table public.priorities
  add column if not exists version integer not null default 1;

alter table public.finance_months
  add column if not exists version integer not null default 1;

comment on column public.expenses.version is
  'Optimistic concurrency token. A conditional UPDATE/DELETE (id + version) affecting 0 rows means another write happened first.';
comment on column public.priorities.version is
  'Optimistic concurrency token. See expenses.version.';
comment on column public.finance_months.version is
  'Optimistic concurrency token. See expenses.version.';

commit;
