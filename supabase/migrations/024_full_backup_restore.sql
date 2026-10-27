-- Migration 024: atomic owner-only restore for schema-v2 JSON backups and
-- normalize the three work-branch read rules introduced by migration 023.
-- Authentication users,
-- profiles and secrets are intentionally never replaced by a business backup.
-- Qualify the conflict target because `user_id` is also an OUT parameter of
-- this table-returning function on PostgreSQL.
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
 on conflict on constraint bz_work_people_pkey do update
   set display_name=excluded.display_name,email=excluded.email,role=excluded.role,active=true;
 update public.bz_work_people w set active=false
 where w.active=true and exists (select 1 from public.profiles p where p.id=w.user_id and (p.is_active=false or (p.is_private=true and p.id<>auth.uid())));
 return query select w.user_id,w.display_name,w.email,w.role,w.active,
   case when w.role='manager' then 'Chủ trung tâm' when w.role='trainer' then 'Đào tạo' when w.role='teacher' then 'Giáo viên' else 'Hành chính' end,
   case when w.role='teacher' then 'teacher'
        when w.role='trainer' then 'training'
        else 'admin' end,
   (p.permissions->>'teacherId')
 from public.bz_work_people w join public.profiles p on p.id=w.user_id
 where w.active=true and (w.user_id=auth.uid() or public.bz_work_role() in ('manager','admin')
   or (public.bz_work_role()='trainer' and w.role in ('trainer','teacher')));
end $$;

revoke all on function public.bz_work_sync_people() from public, anon;
grant execute on function public.bz_work_sync_people() to authenticated;

-- Migration 023 added native `teacher` tasks, but the child-table policies
-- still called the two-branch helper from migration 016. Keep task rows and
-- their notes/reasons/events/handoffs under exactly the same visibility rule.
create or replace function public.bz_work_can_read(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bz_work_tasks t
    where t.id = p_task_id
      and case
        when public.bz_work_role() in ('manager','admin') then true
        when public.bz_work_role()='trainer' then t.branch in ('training','teacher')
        when public.bz_work_role()='teacher' then
          t.branch in ('training','teacher')
          and (t.assigned_uid=(select auth.uid()) or public.bz_work_is_pending_recipient(t.id))
        else false
      end
  )
$$;

revoke all on function public.bz_work_can_read(uuid) from public, anon;
grant execute on function public.bz_work_can_read(uuid) to authenticated;

-- Remove the temporary policy name from migration 023 as well as the original
-- policy so permissive policies cannot accidentally widen access by OR-ing.
drop policy if exists bz_work_tasks_select on public.bz_work_tasks;
drop policy if exists bz_work_tasks_read on public.bz_work_tasks;
create policy bz_work_tasks_read on public.bz_work_tasks
for select to authenticated using (
  public.bz_work_role() in ('manager','admin')
  or (public.bz_work_role()='trainer' and branch in ('training','teacher'))
  or (
    public.bz_work_role()='teacher'
    and branch in ('training','teacher')
    and (assigned_uid=(select auth.uid()) or public.bz_work_is_pending_recipient(id))
  )
);

create or replace function public.bz_restore_full_backup(p_payload jsonb, p_work jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'owner' and p.is_active = true
  ) then
    raise exception 'Only an active owner can restore a full backup';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_work) <> 'object'
     or jsonb_typeof(p_work->'tasks') <> 'array'
     or jsonb_typeof(p_work->'notes') <> 'array'
     or jsonb_typeof(p_work->'reasons') <> 'array'
     or jsonb_typeof(p_work->'handoffs') <> 'array'
     or jsonb_typeof(p_work->'events') <> 'array' then
    raise exception 'Invalid backup payload';
  end if;

  -- Refresh the account projection without relying on a result-returning RPC.
  -- Work records keep their original authors/assignees and therefore fail
  -- atomically if an identity is missing.
  insert into public.bz_work_people(user_id, display_name, email, role, active)
  select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email), p.email,
    case when p.role = 'owner' then 'manager'
         when p.role = 'admin' then 'admin'
         when p.role = 'trainer' then 'trainer'
         else 'teacher' end,
    true
  from public.profiles p
  where p.is_active = true
  on conflict on constraint bz_work_people_pkey do update
    set display_name = excluded.display_name,
        email = excluded.email,
        role = excluded.role,
        active = true;
  lock table public.center_data, public.bz_work_tasks, public.bz_work_notes,
    public.bz_work_reasons, public.bz_work_handoffs, public.bz_work_events
    in exclusive mode;

  delete from public.bz_work_handoffs;
  delete from public.bz_work_events;
  delete from public.bz_work_notes;
  delete from public.bz_work_reasons;
  delete from public.bz_work_tasks;

  insert into public.bz_work_tasks(
    id, branch, title, description, assigned_uid, created_by, work_date,
    shift_label, class_label, class_id, is_teacher_off, substitute_teacher_id,
    schedule_change_id, custom_values, ack, ack_name, ack_note, priority,
    status, completed_at, needs_handover, email_sent_at, email_sent_by,
    email_sent_to, created_at, updated_at
  )
  select id, branch, title, coalesce(description, ''), assigned_uid, created_by,
    work_date, coalesce(shift_label, 'Ca chiều'), coalesce(class_label, ''),
    class_id, coalesce(is_teacher_off, false), substitute_teacher_id,
    schedule_change_id, coalesce(custom_values, '{}'::jsonb), ack, ack_name,
    ack_note, coalesce(priority, 'normal'), coalesce(status, 'todo'),
    completed_at, coalesce(needs_handover, false), email_sent_at, email_sent_by,
    email_sent_to, coalesce(created_at, now()), coalesce(updated_at, now())
  from jsonb_to_recordset(p_work->'tasks') as x(
    id uuid, branch text, title text, description text, assigned_uid uuid,
    created_by uuid, work_date date, shift_label text, class_label text,
    class_id text, is_teacher_off boolean, substitute_teacher_id text,
    schedule_change_id text, custom_values jsonb, ack text, ack_name text,
    ack_note text, priority text, status text, completed_at timestamptz,
    needs_handover boolean, email_sent_at timestamptz, email_sent_by uuid,
    email_sent_to text, created_at timestamptz, updated_at timestamptz
  );

  insert into public.bz_work_notes(id, task_id, author_uid, author_name, body, created_at)
  select id, task_id, author_uid, author_name, body, coalesce(created_at, now())
  from jsonb_to_recordset(p_work->'notes') as x(
    id uuid, task_id uuid, author_uid uuid, author_name text, body text, created_at timestamptz
  );

  insert into public.bz_work_reasons(id, task_id, author_uid, author_name, kind, body, created_at)
  select id, task_id, author_uid, author_name, kind, body, coalesce(created_at, now())
  from jsonb_to_recordset(p_work->'reasons') as x(
    id uuid, task_id uuid, author_uid uuid, author_name text, kind text, body text, created_at timestamptz
  );

  insert into public.bz_work_handoffs(
    id, task_id, from_uid, to_uid, note, handed_at, acknowledged_at,
    acknowledged_by, ack_name, ack_note
  )
  select id, task_id, from_uid, to_uid, coalesce(note, ''),
    coalesce(handed_at, now()), acknowledged_at, acknowledged_by, ack_name, ack_note
  from jsonb_to_recordset(p_work->'handoffs') as x(
    id uuid, task_id uuid, from_uid uuid, to_uid uuid, note text,
    handed_at timestamptz, acknowledged_at timestamptz,
    acknowledged_by uuid, ack_name text, ack_note text
  );

  -- Event IDs are audit ordering details; PostgreSQL assigns fresh identity
  -- values while preserving every event's task, actor, action, payload and time.
  insert into public.bz_work_events(task_id, actor_uid, action, payload, created_at)
  select task_id, actor_uid, action, coalesce(payload, '{}'::jsonb), coalesce(created_at, now())
  from jsonb_to_recordset(p_work->'events') as x(
    id bigint, task_id uuid, actor_uid uuid, action text, payload jsonb, created_at timestamptz
  )
  order by id;

  insert into public.center_data(id, payload, updated_by)
  values ('primary', p_payload, (select auth.uid()))
  on conflict(id) do update set payload = excluded.payload, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.bz_restore_full_backup(jsonb, jsonb) from public, anon;
grant execute on function public.bz_restore_full_backup(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
