-- Run after 010, before deploying delegated academic management.
-- Only replaces permission guards. No profiles or centre payloads are modified.
-- Missing academic grants remain denied. Settings, backups, enrollment/finance,
-- assigned-class attendance/grades, CAS and quotas retain their existing checks.
create or replace function public.guard_center_data_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor public.profiles; key text; attendance record; allowed_classes text[]; item jsonb; expected jsonb; paid numeric; debt numeric;
begin
  if jsonb_typeof(new.payload) <> 'object' then raise exception 'Invalid payload' using errcode = '22023'; end if;
  for key in select unnest(array['programs','teachers','rooms','classes','students','timetableSlots','grades','receipts','backups','activityLogs','attendanceSessions']) loop
    if jsonb_typeof(coalesce(new.payload->key, '[]'::jsonb)) <> 'array' then raise exception 'Invalid entity array: %', key using errcode = '22023'; end if;
    if (select count(*) <> count(distinct v->>'id') or coalesce(bool_or(jsonb_typeof(v) <> 'object' or coalesce(v->>'id','') = ''),false) from jsonb_array_elements(coalesce(new.payload->key,'[]'::jsonb)) v) then raise exception 'Duplicate or invalid entity ID: %', key using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) loop
    for key in select unnest(array['courseFee','discount','paidAmount','debtAmount']) loop
      if jsonb_typeof(item->key) is distinct from 'number' or (item->>key)::numeric < 0 then raise exception 'Invalid receipt amount' using errcode = '22023'; end if;
    end loop;
  end loop;
  if auth.role() = 'service_role' then return new; end if;
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null then raise exception 'Inactive account' using errcode = '42501'; end if;
  if actor.role = 'owner' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Only owners can initialize centre data' using errcode = '42501'; end if;

  for key in select unnest(array['settings','backups']) loop
    if old.payload->key is distinct from new.payload->key then raise exception 'Owner permission required: %', key using errcode = '42501'; end if;
  end loop;
  for key in select unnest(array['programs','rooms','timetableSlots']) loop
    if old.payload->key is distinct from new.payload->key
       and coalesce(actor.permissions->'academic'->(case when key = 'timetableSlots' then 'classes' else key end), 'false'::jsonb) <> 'true'::jsonb then
      raise exception 'Owner permission required: % (or delegated academic permission)', key using errcode = '42501';
    end if;
  end loop;
  perform public.assert_center_entity_permissions(old.payload->'students', new.payload->'students', actor.permissions, 'student', 'add', 'edit', 'delete', array['feeStatus']);
  perform public.assert_center_entity_permissions(old.payload->'teachers', new.payload->'teachers', actor.permissions, 'teacher', 'edit', 'edit', 'delete', array['assignedClassIds']);
  perform public.assert_center_entity_permissions(old.payload->'receipts', new.payload->'receipts', actor.permissions, 'tuition', 'collect', 'collect', 'delete');
  perform public.assert_center_entity_permissions(old.payload->'grades', new.payload->'grades', actor.permissions, 'grade', 'edit', 'edit', 'edit');
  perform public.assert_center_entity_permissions(old.payload->'classes', new.payload->'classes', jsonb_build_object('class', jsonb_build_object('add', actor.permissions->'academic'->'classes' = 'true'::jsonb, 'edit', actor.permissions->'academic'->'classes' = 'true'::jsonb, 'delete', actor.permissions->'academic'->'classes' = 'true'::jsonb)), 'class', 'add', 'edit', 'delete', array['studentIds']);

  -- Delegated management cannot remove academic records with dependencies/history.
  for item in select value from jsonb_array_elements(coalesce(old.payload->'classes','[]'::jsonb)) c
    where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) n where n->>'id'=c->>'id')
  loop
    for key in select unnest(array['students','receipts','grades','attendanceSessions','enrollments','scheduleChanges']) loop
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where v->>'classId'=item->>'id') then
        raise exception 'Class history must be preserved' using errcode = '42501';
      end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(old.payload->'rooms','[]'::jsonb)) r
    where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'rooms','[]'::jsonb)) n where n->>'id'=r->>'id')
  loop
    for key in select unnest(array['classes','timetableSlots','scheduleChanges']) loop
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where v->>'roomId'=item->>'id') then
        raise exception 'Room references must be preserved' using errcode = '42501';
      end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(old.payload->'programs','[]'::jsonb)) p
    where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'programs','[]'::jsonb)) n where n->>'id'=p->>'id')
  loop
    for key in select unnest(array['classes','students']) loop
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where v->>'programId'=item->>'id') then
        raise exception 'Program references must be preserved' using errcode = '42501';
      end if;
    end loop;
  end loop;

  -- feeStatus is derived, but cannot be used as an unchecked permission bypass.
  for item in select value from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) loop
    select coalesce(sum((r.value->>'paidAmount')::numeric),0), coalesce(sum((r.value->>'debtAmount')::numeric),0) into paid,debt
    from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) r where r.value->>'studentId' = item->>'id';
    debt := debt + public.center_unbilled_session_debt(new.payload, item->>'id');
    if coalesce(item->>'feeStatus','') <> (case when debt > 0 then case when paid > 0 then 'partial' else 'debt' end else case when paid > 0 then 'paid' else 'unpaid' end end) then raise exception 'Invalid derived fee status' using errcode = '22023'; end if;
  end loop;

  -- Denormalized roster/teacher fields are permitted only when they match references.
  for item in select value from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) loop
    select coalesce(jsonb_agg(s.value->'id' order by s.value->>'id'), '[]'::jsonb) into expected
    from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where s.value->>'classId' = item->>'id';
    if expected is distinct from (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(item->'studentIds') v) then raise exception 'Invalid class roster' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'teachers','[]'::jsonb)) loop
    select coalesce(jsonb_agg(c.value->'id' order by c.value->>'id'), '[]'::jsonb) into expected
    from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c where c.value->>'teacherId' = item->>'id';
    if expected is distinct from (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(item->'assignedClassIds') v) then raise exception 'Invalid teacher assignment' using errcode = '22023'; end if;
  end loop;

  select array_agg(c.value->>'id') into allowed_classes
  from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c
  where (actor.permissions->'assignedClassIds') ? (c.value->>'id')
     or (actor.permissions->>'teacherId' is not null and c.value->>'teacherId' = actor.permissions->>'teacherId');
  for attendance in
    select b.value as old_value, a.value as new_value
    from jsonb_array_elements(coalesce(old.payload->'attendanceSessions', '[]'::jsonb)) b
    full join jsonb_array_elements(coalesce(new.payload->'attendanceSessions', '[]'::jsonb)) a on b.value->>'id' = a.value->>'id'
    where b.value is distinct from a.value
  loop
    if not (coalesce(actor.permissions->'student'->>'edit','false') = 'true' or coalesce(actor.permissions->'teacher'->>'edit','false') = 'true')
       or attendance.new_value is null or not coalesce(attendance.new_value->>'classId' = any(allowed_classes), false)
       or (attendance.old_value is not null and not coalesce(attendance.old_value->>'classId' = any(allowed_classes), false)) then
      raise exception 'Attendance permission denied' using errcode = '42501';
    end if;
  end loop;
  -- Teachers may edit grades only for explicitly assigned classes.
  if old.payload->'grades' is distinct from new.payload->'grades' then
    for attendance in
      select b.value as old_value, a.value as new_value
      from jsonb_array_elements(coalesce(old.payload->'grades','[]'::jsonb)) b
      full join jsonb_array_elements(coalesce(new.payload->'grades','[]'::jsonb)) a on b.value->>'id' = a.value->>'id'
      where b.value is distinct from a.value
    loop
      if not coalesce(coalesce(attendance.new_value, attendance.old_value)->>'classId' = any(allowed_classes), false) then raise exception 'Class grade permission denied' using errcode = '42501'; end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_center_data_permissions() from public;

create or replace function public.guard_center_operations()
returns trigger language plpgsql security definer set search_path = public as $$
declare key text; item jsonb; actor public.profiles; permissions jsonb;
begin
  if tg_op = 'UPDATE' and ((old.payload ? 'scheduleChanges' and not (new.payload ? 'scheduleChanges')) or (old.payload ? 'enrollments' and not (new.payload ? 'enrollments'))) then
    raise exception 'Client update required: operations fields missing' using errcode = '22023';
  end if;
  for key in select unnest(array['enrollments','scheduleChanges']) loop
    if jsonb_typeof(coalesce(new.payload->key,'[]'::jsonb)) <> 'array' then raise exception 'Invalid operations array: %', key using errcode = '22023'; end if;
    if (select count(*) <> count(distinct v->>'id') or coalesce(bool_or(jsonb_typeof(v) <> 'object' or coalesce(v->>'id','') = ''),false) from jsonb_array_elements(coalesce(new.payload->key,'[]'::jsonb)) v) then raise exception 'Duplicate operations ID' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) loop
    perform public.assert_optional_center_date(item->'startDate');
    perform public.assert_optional_center_date(item->'endDate');
    perform public.assert_optional_center_date(item->'completedDate');
    if item->>'startDate' > item->>'endDate' then raise exception 'Course dates reversed' using errcode = '22023'; end if;
    if item ? 'totalSessions' and (jsonb_typeof(item->'totalSessions') <> 'number' or (item->>'totalSessions')::numeric < 1 or (item->>'totalSessions')::numeric <> trunc((item->>'totalSessions')::numeric)) then raise exception 'Invalid total sessions' using errcode = '22023'; end if;
    if item ? 'courseStatus' and coalesce(item->>'courseStatus','') not in ('planned','active','paused','completed') then raise exception 'Invalid course status' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) loop
    perform public.assert_optional_center_date(item->'dueDate');
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'enrollments','[]'::jsonb)) loop
    perform public.assert_optional_center_date(item->'startDate'); perform public.assert_optional_center_date(item->'endDate');
    if coalesce(item->>'status','') not in ('active','reserved','completed','transferred','dropped') or item->>'startDate' > item->>'endDate' then raise exception 'Invalid enrollment' using errcode = '22023'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where s->>'id'=item->>'studentId') or not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c where c->>'id'=item->>'classId') then raise exception 'Missing enrollment reference' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'scheduleChanges','[]'::jsonb)) loop
    perform public.assert_optional_center_date(item->'date'); perform public.assert_optional_center_date(item->'sourceDate');
    if not (item ? 'date') or coalesce(item->>'kind','') not in ('cancel','move','extra') or coalesce(trim(item->>'reason'),'') = '' then raise exception 'Invalid schedule change' using errcode = '22023'; end if;
    if (item->>'kind' <> 'extra' and coalesce(item->>'sourceSlotId','') = '') or (item->>'kind' = 'move' and not (item ? 'sourceDate')) then raise exception 'Missing source lesson' using errcode = '22023'; end if;
    if coalesce(item->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(item->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'startTime' >= item->>'endTime' then raise exception 'Invalid lesson time' using errcode = '22023'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c where c->>'id'=item->>'classId') then raise exception 'Missing schedule class' using errcode = '22023'; end if;
  end loop;
  if auth.role() = 'service_role' then return new; end if;
  select * into actor from public.profiles where id=auth.uid() and is_active;
  if actor.id is null then raise exception 'Inactive account' using errcode = '42501'; end if;
  if actor.role = 'owner' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Only owners can initialize operations' using errcode = '42501'; end if;
  if coalesce(old.payload->'scheduleChanges','[]'::jsonb) is distinct from coalesce(new.payload->'scheduleChanges','[]'::jsonb)
     and coalesce(actor.permissions->'academic'->'classes', 'false'::jsonb) <> 'true'::jsonb then raise exception 'Owner permission required: scheduleChanges' using errcode = '42501'; end if;
  permissions := jsonb_set(coalesce(actor.permissions,'{}'::jsonb), '{student}', coalesce(actor.permissions->'student','{}'::jsonb) || jsonb_build_object('history', coalesce(actor.permissions->'student'->>'edit','false')='true' or coalesce(actor.permissions->'student'->>'add','false')='true'));
  perform public.assert_center_entity_permissions(old.payload->'enrollments',new.payload->'enrollments',permissions,'student','history','edit','delete');
  return new;
end;
$$;
revoke all on function public.guard_center_operations() from public;
