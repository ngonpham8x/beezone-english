-- Add explicit account ranks without changing permissions or activating accounts.
-- Each added enum value is committed by this migration before migration 019 uses it.
do $account_roles$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace and t.typname = 'app_role' and e.enumlabel = 'admin'
  ) then
    execute 'alter type public.app_role add value ''admin''';
  end if;
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace and t.typname = 'app_role' and e.enumlabel = 'trainer'
  ) then
    execute 'alter type public.app_role add value ''trainer''';
  end if;
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace and t.typname = 'app_role' and e.enumlabel = 'teacher'
  ) then
    execute 'alter type public.app_role add value ''teacher''';
  end if;
end
$account_roles$;
