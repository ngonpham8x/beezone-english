-- Migration 032: publish the existing center snapshot for cross-device updates.
-- Idempotent and data-preserving; CAS remains the authority for every write.
begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and to_regclass('public.center_data') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'center_data'
     ) then
    alter publication supabase_realtime add table public.center_data;
  end if;
end $$;

commit;
