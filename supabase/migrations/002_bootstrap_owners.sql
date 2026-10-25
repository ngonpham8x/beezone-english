-- This migration intentionally contains no administrator email addresses.
-- Add them privately from the Supabase Dashboard after the migration is applied.

create table public.owner_bootstrap_allowlist (
  email text primary key check (email = lower(email) and char_length(email) <= 254),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.owner_bootstrap_allowlist enable row level security;
revoke all on table public.owner_bootstrap_allowlist from anon, authenticated;

create or replace function public.promote_bootstrap_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set role = 'owner', is_active = true
  where email = new.email;
  return new;
end;
$$;

create trigger owner_allowlist_promotes_existing_profile
  after insert on public.owner_bootstrap_allowlist
  for each row execute procedure public.promote_bootstrap_owner();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_bootstrap_owner boolean := false;
begin
  select exists (
    select 1
    from public.owner_bootstrap_allowlist
    where email = lower(new.email)
  ) into is_bootstrap_owner;

  -- New accounts remain inactive teachers unless their verified email was explicitly
  -- placed in the bootstrap allowlist or a protected owner invitation creates it.
  insert into public.profiles (id, email, full_name, avatar_url, role, is_active)
  values (
    new.id,
    lower(new.email),
    coalesce(left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120), ''),
    nullif(left(new.raw_user_meta_data ->> 'avatar_url', 2000), ''),
    case when is_bootstrap_owner then 'owner'::public.app_role else 'teacher'::public.app_role end,
    is_bootstrap_owner
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
