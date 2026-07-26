create extension if not exists pgcrypto;

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.financial_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null default 'person' check (kind in ('person', 'household', 'managed')),
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name)
);

create table public.finance_months (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  label text not null,
  income numeric(14, 2) not null default 0 check (income >= 0),
  house_contribution numeric(14, 2) not null default 0 check (house_contribution >= 0),
  planned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, period)
);

create table public.profile_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  month_id uuid not null,
  profile_id uuid not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (month_id, profile_id),
  foreign key (month_id, household_id) references public.finance_months(id, household_id) on delete cascade,
  foreign key (profile_id, household_id) references public.financial_profiles(id, household_id) on delete cascade
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month_id uuid not null,
  owner_profile_id uuid not null,
  paid_by_profile_id uuid,
  description text not null check (char_length(trim(description)) between 1 and 160),
  category text not null default 'Outros',
  amount numeric(14, 2) not null check (amount >= 0),
  status text not null default 'A pagar' check (status in ('Pago', 'A pagar')),
  expense_date date not null,
  due_date date,
  payment_method text not null default 'Não informado',
  note text not null default '',
  recurring boolean not null default false,
  recurring_key uuid,
  installment_key uuid,
  installment_number smallint check (installment_number is null or installment_number > 0),
  installment_total smallint check (installment_total is null or installment_total > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (month_id, household_id) references public.finance_months(id, household_id) on delete cascade,
  foreign key (owner_profile_id, household_id) references public.financial_profiles(id, household_id),
  foreign key (paid_by_profile_id, household_id) references public.financial_profiles(id, household_id)
);

create table public.priorities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month_id uuid not null,
  profile_id uuid not null,
  description text not null check (char_length(trim(description)) between 1 and 160),
  target_amount numeric(14, 2) not null check (target_amount >= 0),
  saved_amount numeric(14, 2) not null default 0 check (saved_amount >= 0),
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'A pagar' check (status in ('A pagar', 'Pago', 'Adiar')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (month_id, household_id) references public.finance_months(id, household_id) on delete cascade,
  foreign key (profile_id, household_id) references public.financial_profiles(id, household_id)
);

create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null default 'Outros',
  monthly_limit numeric(14, 2) not null default 0 check (monthly_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_id, household_id) references public.financial_profiles(id, household_id) on delete cascade
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_profile_id uuid not null,
  to_profile_id uuid not null,
  period date not null check (period = date_trunc('month', period)::date),
  amount numeric(14, 2) not null check (amount > 0),
  settled_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  check (from_profile_id <> to_profile_id),
  foreign key (from_profile_id, household_id) references public.financial_profiles(id, household_id),
  foreign key (to_profile_id, household_id) references public.financial_profiles(id, household_id)
);

create index expenses_household_month_idx on public.expenses (household_id, month_id);
create index expenses_owner_date_idx on public.expenses (owner_profile_id, expense_date desc);
create index expenses_status_due_idx on public.expenses (status, due_date);
create index priorities_household_month_idx on public.priorities (household_id, month_id);
create index household_members_user_idx on public.household_members (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_users_set_updated_at before update on public.app_users
for each row execute function public.set_updated_at();
create trigger households_set_updated_at before update on public.households
for each row execute function public.set_updated_at();
create trigger financial_profiles_set_updated_at before update on public.financial_profiles
for each row execute function public.set_updated_at();
create trigger finance_months_set_updated_at before update on public.finance_months
for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function public.set_updated_at();
create trigger priorities_set_updated_at before update on public.priorities
for each row execute function public.set_updated_at();
create trigger envelopes_set_updated_at before update on public.envelopes
for each row execute function public.set_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_household_creator(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households
    where id = target_household_id
      and created_by = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_admin(uuid) from public;
revoke all on function public.is_household_creator(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_creator(uuid) to authenticated;

alter table public.app_users enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.financial_profiles enable row level security;
alter table public.finance_months enable row level security;
alter table public.profile_budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.priorities enable row level security;
alter table public.envelopes enable row level security;
alter table public.settlements enable row level security;

create policy "Users manage own profile"
on public.app_users for all to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Members read households"
on public.households for select to authenticated
using (public.is_household_member(id));

create policy "Users create households"
on public.households for insert to authenticated
with check (created_by = auth.uid());

create policy "Admins update households"
on public.households for update to authenticated
using (public.is_household_admin(id))
with check (public.is_household_admin(id));

create policy "Members read memberships"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));

create policy "Owners create first membership"
on public.household_members for insert to authenticated
with check (
  public.is_household_admin(household_id)
  or (
    user_id = auth.uid()
    and role = 'owner'
    and public.is_household_creator(household_id)
  )
);

create policy "Admins update memberships"
on public.household_members for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "Admins delete memberships"
on public.household_members for delete to authenticated
using (public.is_household_admin(household_id));

create policy "Members manage financial profiles"
on public.financial_profiles for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage finance months"
on public.finance_months for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage profile budgets"
on public.profile_budgets for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage expenses"
on public.expenses for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage priorities"
on public.priorities for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage envelopes"
on public.envelopes for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage settlements"
on public.settlements for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
