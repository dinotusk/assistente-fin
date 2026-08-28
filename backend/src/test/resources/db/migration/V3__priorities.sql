-- Test-only migration (P3-FINANCIAL-TOOLS), applied exclusively to the disposable Testcontainers
-- PostgreSQL instance — never the real Supabase schema. Additive to V2: adds the trimmed mirror
-- of production's `priorities` table (see supabase/migrations/20260726013000_initial_finance_schema.sql)
-- that get_goals needs. V1/V2 are left untouched.
create table priorities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references finance_months(id) on delete cascade,
  profile_id uuid not null references financial_profiles(id),
  description text not null,
  target_amount numeric(14, 2) not null default 0,
  saved_amount numeric(14, 2) not null default 0,
  priority smallint not null default 2,
  status text not null default 'A pagar'
);
