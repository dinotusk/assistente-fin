-- bootstrap_household generated its first month's label via Postgres's
-- to_char(period, 'TMMonth YYYY'), which uses the server's lc_time locale —
-- not necessarily Portuguese. Every subsequent month (created client-side
-- via formatMonthLabel(), which explicitly uses toLocaleDateString("pt-BR"))
-- is fine; only that first auto-bootstrapped month could come out in
-- English ("July 2026" instead of "Julho de 2026"). Replaced with a
-- hardcoded Portuguese month name lookup so this never depends on server
-- locale again, and backfilled the households already affected.

create or replace function public.bootstrap_household(
  user_display_name text,
  new_household_name text default 'Minha casa'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  period_start date := date_trunc('month', current_date)::date;
  pt_month_names text[] := array[
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  month_label text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.app_users (id, display_name)
  values (current_user_id, trim(user_display_name))
  on conflict (id) do update
    set display_name = excluded.display_name;

  select household_id
  into target_household_id
  from public.household_members
  where user_id = current_user_id
  order by created_at
  limit 1;

  if target_household_id is not null then
    return target_household_id;
  end if;

  insert into public.households (name, created_by)
  values (trim(new_household_name), current_user_id)
  returning id into target_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, current_user_id, 'owner');

  insert into public.financial_profiles (household_id, name, kind, sort_order)
  values
    (target_household_id, 'Pessoa 1', 'household', 0),
    (target_household_id, 'Pessoa 2', 'managed', 1);

  month_label := pt_month_names[extract(month from period_start)::int]
    || ' de ' || extract(year from period_start)::text;

  insert into public.finance_months (
    household_id,
    period,
    label,
    income,
    house_contribution,
    planned
  )
  values (
    target_household_id,
    period_start,
    month_label,
    0,
    0,
    false
  );

  return target_household_id;
end;
$$;

revoke all on function public.bootstrap_household(text, text) from public;
grant execute on function public.bootstrap_household(text, text) to authenticated;

-- Backfill the months already created with an English label.
update public.finance_months
set label = (array[
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
])[extract(month from period)::int] || ' de ' || extract(year from period)::text
where label ~ '^[A-Za-z]+ [0-9]{4}$'
  and label !~ '^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)';
