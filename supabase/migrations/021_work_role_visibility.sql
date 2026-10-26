-- Run after 020. Resolve work visibility from the verified active profile so a
-- rank change is effective immediately and never depends on a stale projection
-- in bz_work_people. Existing task/note/reason/handoff RLS policies call this
-- helper, therefore owners and administrators can read every work branch.
create or replace function public.bz_work_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'owner' then 'manager'
    when p.role = 'admin' then 'admin'
    when p.role = 'trainer' then 'trainer'
    else 'teacher'
  end
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
  limit 1
$$;

revoke all on function public.bz_work_role() from public, anon;
grant execute on function public.bz_work_role() to authenticated;
