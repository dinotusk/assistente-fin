-- Test-only migration (P2-FINANCIAL-DOMAIN), applied exclusively to the disposable Testcontainers
-- PostgreSQL instance — never the real Supabase schema. A trimmed mirror of the real production
-- tables (see supabase/migrations/20260726013000_initial_finance_schema.sql), keeping only the
-- columns FinancialSummaryIntegrationTest actually needs. RLS/triggers/RPCs are intentionally
-- omitted: the Spring backend connects directly and enforces tenancy itself in Java (see the
-- ADR-004 addendum) — it never relies on RLS, so there is nothing to prove about RLS here.
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table financial_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  kind text not null default 'person',
  sort_order smallint not null default 0,
  active boolean not null default true
);

create table finance_months (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period date not null,
  label text not null,
  income numeric(14, 2) not null default 0,
  house_contribution numeric(14, 2) not null default 0,
  planned boolean not null default false,
  version integer not null default 1,
  unique (household_id, period)
);

create table profile_budgets (
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references finance_months(id) on delete cascade,
  profile_id uuid not null references financial_profiles(id) on delete cascade,
  amount numeric(14, 2) not null default 0,
  version integer not null default 1,
  primary key (month_id, profile_id)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_id uuid not null references finance_months(id) on delete cascade,
  owner_profile_id uuid not null references financial_profiles(id),
  description text not null,
  entry_type text not null default 'expense',
  category text not null default 'Outros',
  amount numeric(14, 2) not null,
  status text not null default 'A pagar',
  expense_date date not null,
  due_date date,
  competence date not null,
  version integer not null default 1
);
