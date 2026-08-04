create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by uuid references auth.users(id),
  used_at timestamptz
);

create index household_invites_household_idx on public.household_invites (household_id);

alter table public.household_invites enable row level security;

create policy "Members read household invites"
on public.household_invites for select to authenticated
using (public.is_household_member(household_id));

create policy "Admins delete household invites"
on public.household_invites for delete to authenticated
using (public.is_household_admin(household_id));

-- Returns an active invite code for the caller's household, reusing one if it hasn't expired yet.
create or replace function public.create_household_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  existing_code text;
  new_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select household_id into target_household_id
  from public.household_members
  where user_id = current_user_id
  order by created_at
  limit 1;

  if target_household_id is null then
    raise exception 'Nenhuma casa financeira encontrada para este usuario.';
  end if;

  if not public.is_household_admin(target_household_id) then
    raise exception 'Apenas administradores podem gerar convites.';
  end if;

  select code into existing_code
  from public.household_invites
  where household_id = target_household_id
    and used_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if existing_code is not null then
    return existing_code;
  end if;

  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.household_invites where code = new_code);
  end loop;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (target_household_id, new_code, current_user_id, now() + interval '14 days');

  return new_code;
end;
$$;

revoke all on function public.create_household_invite() from public;
grant execute on function public.create_household_invite() to authenticated;

-- Joins the caller's account to the invite's household instead of letting them bootstrap their own.
create or replace function public.redeem_household_invite(
  p_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  invite_row public.household_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into invite_row
  from public.household_invites
  where code = upper(trim(p_code))
    and used_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if invite_row.id is null then
    raise exception 'Convite invalido ou expirado.';
  end if;

  insert into public.app_users (id, display_name)
  values (current_user_id, trim(p_display_name))
  on conflict (id) do update
    set display_name = excluded.display_name;

  if not exists (
    select 1 from public.household_members
    where household_id = invite_row.household_id and user_id = current_user_id
  ) then
    insert into public.household_members (household_id, user_id, role)
    values (invite_row.household_id, current_user_id, 'member');
  end if;

  update public.household_invites
  set used_by = current_user_id, used_at = now()
  where id = invite_row.id;

  return invite_row.household_id;
end;
$$;

revoke all on function public.redeem_household_invite(text, text) from public;
grant execute on function public.redeem_household_invite(text, text) to authenticated;
