alter table public.expenses
  add column if not exists entry_type text not null default 'expense',
  add column if not exists competence date;

update public.expenses
set competence = date_trunc('month', expense_date)::date
where competence is null;

alter table public.expenses
  alter column competence set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_entry_type_check'
  ) then
    alter table public.expenses
      add constraint expenses_entry_type_check
      check (entry_type in ('expense', 'income'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_competence_month_check'
  ) then
    alter table public.expenses
      add constraint expenses_competence_month_check
      check (competence = date_trunc('month', competence)::date);
  end if;
end;
$$;

create index if not exists expenses_competence_profile_idx
  on public.expenses (household_id, competence, owner_profile_id);

create index if not exists expenses_recurring_key_idx
  on public.expenses (household_id, recurring_key)
  where recurring_key is not null;

create index if not exists expenses_installment_key_idx
  on public.expenses (household_id, installment_key)
  where installment_key is not null;
