-- Authentication and role model for the Phúc Phúc Thịnh internal app.
-- Run this migration in the Supabase SQL Editor before setting Vercel variables.

-- `staff` remains in the enum only so existing databases and audit rows can be migrated safely.
create type public.app_role as enum ('owner', 'admin', 'trainer', 'teacher', 'staff');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  role public.app_role not null default 'teacher',
  is_active boolean not null default false,
  permissions jsonb not null default jsonb_build_object(
    'student', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', false, 'export', false),
    'teacher', jsonb_build_object('view', true, 'edit', true, 'delete', false),
    'tuition', jsonb_build_object('view', true, 'collect', true, 'delete', false, 'showDebt', false),
    'grade', jsonb_build_object('view', true, 'edit', true),
    'excel', jsonb_build_object('import', true, 'export', false),
    'report', jsonb_build_object('view', false, 'revenue', false)
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

-- A signed-in user needs only their own profile to render their role. All changes
-- to profiles are made by the protected Vercel endpoint using a server secret.
create policy "users can view their own active profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id and is_active = true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Do not trust role or activation values from user metadata. New accounts are
  -- inactive teachers by default; the protected admin endpoint activates invitations.
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120), ''),
    nullif(left(new.raw_user_meta_data ->> 'avatar_url', 2000), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Bootstrap exactly one owner after that person has signed in once with Google or
-- has been created in Supabase Auth. Replace the email and execute this once:
-- update public.profiles
-- set role = 'owner', is_active = true
-- where email = 'owner@example.com';
