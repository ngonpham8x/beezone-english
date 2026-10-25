-- New accounts default to Giáo viên. Retired `staff` profiles keep every permission
-- and relationship; only their rank label changes.
alter table public.profiles alter column role set default 'teacher'::public.app_role;
update public.profiles set role = 'teacher' where role = 'staff';

-- Keep the work-assignee projection aligned with the explicitly stored account rank.
create or replace function public.bz_work_sync_people()
returns table(user_id uuid, display_name text, email text, role text, active boolean, department text, branch text, teacher_id text)
language plpgsql security definer set search_path = '' as $$
begin
 if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true) then
   raise exception 'Active BeeZone account required';
 end if;
 insert into public.bz_work_people(user_id,display_name,email,role,active)
 select p.id,coalesce(nullif(btrim(p.full_name),''),p.email),p.email,
   case when p.role='owner' then 'manager'
        when p.role='admin' then 'admin'
        when p.role='trainer' then 'trainer'
        else 'teacher' end, true
 from public.profiles p
 where p.is_active=true and (coalesce(p.is_private,false)=false or p.id=auth.uid())
 on conflict(user_id) do update set display_name=excluded.display_name,email=excluded.email,role=excluded.role,active=true;
 update public.bz_work_people w set active=false
 where w.active=true and exists (select 1 from public.profiles p where p.id=w.user_id and (p.is_active=false or (p.is_private=true and p.id<>auth.uid())));
 return query select w.user_id,w.display_name,w.email,w.role,w.active,
   case when w.role='manager' then 'Chủ trung tâm' when w.role='trainer' then 'Đào tạo' when w.role='teacher' then 'Giáo viên' else 'Hành chính' end,
   case when w.role in ('trainer','teacher') then 'training' else 'admin' end,
   (p.permissions->>'teacherId')
 from public.bz_work_people w join public.profiles p on p.id=w.user_id
 where w.active=true and (w.user_id=auth.uid() or public.bz_work_role() in ('manager','admin')
   or (public.bz_work_role()='trainer' and w.role in ('trainer','teacher')));
end $$;

revoke all on function public.bz_work_sync_people() from public, anon;
grant execute on function public.bz_work_sync_people() to authenticated;

notify pgrst, 'reload schema';
