-- Redefine invite functions:
--   - cap household size at 6 members (no billing/plans system yet — a simple
--     fixed limit is enough to stop unbounded growth)
--   - let redeem_household_invite be called by an already-logged-in user too,
--     moving them out of any prior household so lookups that assume a single
--     membership stay deterministic
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
  member_count int;
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

  select count(*) into member_count
  from public.household_members
  where household_id = target_household_id;

  if member_count >= 6 then
    raise exception 'Essa casa ja atingiu o limite de 6 pessoas.';
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
  member_count int;
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

  select count(*) into member_count
  from public.household_members
  where household_id = invite_row.household_id;

  if member_count >= 6 then
    raise exception 'Essa casa ja atingiu o limite de 6 pessoas.';
  end if;

  insert into public.app_users (id, display_name)
  values (current_user_id, trim(p_display_name))
  on conflict (id) do update
    set display_name = excluded.display_name;

  -- A user belongs to exactly one household at a time. Redeeming an invite
  -- while already a member elsewhere moves them, so findHouseholdId()'s
  -- "pick the first membership" lookup stays unambiguous.
  delete from public.household_members
  where user_id = current_user_id and household_id <> invite_row.household_id;

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
