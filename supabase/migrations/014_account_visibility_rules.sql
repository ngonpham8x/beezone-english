-- Display restrictions do not grant a role or activate any account.
create table public.account_visibility_rules (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.account_visibility_rules enable row level security;
revoke all on public.account_visibility_rules from public, anon, authenticated;
grant select on public.account_visibility_rules to service_role;
notify pgrst, 'reload schema';
