-- Display privacy is server-controlled; it never grants a role by itself.
-- Existing accounts and business data keep their current values.
alter table public.profiles add column is_private boolean not null default false;
alter table public.profiles add constraint private_profiles_are_owners
  check (not is_private or role = 'owner');
alter table public.owner_bootstrap_allowlist add column is_private boolean not null default false;

create or replace function public.promote_bootstrap_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare promoted record;
begin
  for promoted in
    update public.profiles
    set role = 'owner', is_active = true, is_private = new.is_private
    where email = new.email and (role, is_active, is_private) is distinct from
      ('owner'::public.app_role, true, new.is_private)
    returning id, full_name
  loop
    insert into public.account_audit_logs(action, actor_name, target_id, target_name, target_role, details)
    values ('ACCOUNT_UPDATED', 'Cấu hình hệ thống', promoted.id,
      case when new.is_private then 'Quản trị hệ thống' else promoted.full_name end,
      'owner', 'Kích hoạt Chủ trung tâm qua cấu hình riêng; cập nhật quyền hiển thị tài khoản.');
  end loop;
  return new;
end;
$$;

drop trigger owner_allowlist_promotes_existing_profile on public.owner_bootstrap_allowlist;
create trigger owner_allowlist_promotes_existing_profile
  after insert or update of is_private on public.owner_bootstrap_allowlist
  for each row execute procedure public.promote_bootstrap_owner();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare bootstrap_owner boolean := false; private_owner boolean := false; created_id uuid;
begin
  select true, is_private into bootstrap_owner, private_owner
    from public.owner_bootstrap_allowlist where email = lower(new.email);
  bootstrap_owner := coalesce(bootstrap_owner, false);
  private_owner := coalesce(private_owner, false);
  insert into public.profiles(id, email, full_name, avatar_url, role, is_active, is_private)
  values (new.id, lower(new.email),
    coalesce(left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120), ''),
    nullif(left(new.raw_user_meta_data ->> 'avatar_url', 2000), ''),
    case when bootstrap_owner then 'owner'::public.app_role else 'staff'::public.app_role end,
    bootstrap_owner, private_owner)
  on conflict (id) do nothing returning id into created_id;
  if bootstrap_owner and created_id is not null then
    insert into public.account_audit_logs(action, actor_name, target_id, target_name, target_role, details)
    values ('ACCOUNT_PROVISIONED', 'Cấu hình hệ thống', new.id,
      case when private_owner then 'Quản trị hệ thống' else
        coalesce(left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120), '') end,
      'owner', 'Kích hoạt Chủ trung tâm đã được cấp quyền qua cấu hình riêng.');
  end if;
  return new;
end;
$$;

revoke all on function public.promote_bootstrap_owner() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
notify pgrst, 'reload schema';
