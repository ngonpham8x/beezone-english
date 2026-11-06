-- Migration 033: server-timestamped evidence for account privacy consent.
-- This table contains account IDs and policy decisions only; no student data is seeded.
begin;

create table public.privacy_consents (
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  purposes text[] not null check (cardinality(purposes) between 1 and 16),
  consented_at timestamptz not null default timezone('utc', now()),
  withdrawn_at timestamptz,
  source text not null default 'web' check (source in ('web')),
  primary key (user_id, policy_version)
);

alter table public.privacy_consents enable row level security;
revoke all on public.privacy_consents from public, anon, authenticated;
grant select on public.privacy_consents to authenticated;
grant select, insert, update, delete on public.privacy_consents to service_role;

create policy "users read own privacy consent"
  on public.privacy_consents for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.bz_accept_privacy_policy(
  p_policy_version text,
  p_purposes text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_center_user() then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  if p_policy_version is null or char_length(p_policy_version) not between 1 and 64
     or p_purposes is null or cardinality(p_purposes) not between 1 and 16
     or exists (select 1 from unnest(p_purposes) purpose where purpose not in ('authentication', 'center-operations', 'security-audit'))
     or cardinality(p_purposes) <> 3
     or (select count(distinct purpose) from unnest(p_purposes) purpose) <> 3 then
    raise exception 'Invalid privacy consent' using errcode = '22023';
  end if;

  insert into public.privacy_consents (user_id, policy_version, purposes, consented_at, withdrawn_at, source)
  values ((select auth.uid()), p_policy_version, p_purposes, timezone('utc', now()), null, 'web')
  on conflict (user_id, policy_version) do update
  set purposes = excluded.purposes,
      consented_at = timezone('utc', now()),
      withdrawn_at = null,
      source = 'web';
end;
$$;

create or replace function public.bz_withdraw_privacy_policy(p_policy_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.privacy_consents
  set withdrawn_at = timezone('utc', now())
  where user_id = (select auth.uid()) and policy_version = p_policy_version;
end;
$$;

revoke all on function public.bz_accept_privacy_policy(text, text[]) from public, anon;
revoke all on function public.bz_withdraw_privacy_policy(text) from public, anon;
grant execute on function public.bz_accept_privacy_policy(text, text[]) to authenticated;
grant execute on function public.bz_withdraw_privacy_policy(text) to authenticated;

notify pgrst, 'reload schema';
commit;
