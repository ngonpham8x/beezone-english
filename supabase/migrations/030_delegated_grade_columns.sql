-- Migration 030: let active administrative/training accounts with grade.edit
-- manage only settings.gradeColumns. Every other settings field remains owner-only.
-- Run after 029_grade_column_kinds.sql.

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
  for item in select value from jsonb_array_elements(coalesce(new.payload->'grades','[]'::jsonb)) loop
    if item ? 'comment' and (jsonb_typeof(item->'comment') is distinct from 'string' or char_length(item->>'comment') > 2000) then
      raise exception 'Invalid grade comment' using errcode = '22023';
    end if;
  end loop;
  if auth.role() = 'service_role' then return new; end if;
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null then raise exception 'Inactive account' using errcode = '42501'; end if;
  if actor.role = 'owner' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Only owners can initialize centre data' using errcode = '42501'; end if;

  if old.payload->'backups' is distinct from new.payload->'backups' then
    raise exception 'Owner permission required: backups' using errcode = '42501';
  end if;
  if (coalesce(old.payload->'settings', '{}'::jsonb) - 'gradeColumns')
       is distinct from
     (coalesce(new.payload->'settings', '{}'::jsonb) - 'gradeColumns') then
    raise exception 'Owner permission required: settings' using errcode = '42501';
  end if;
  if coalesce(old.payload->'settings'->'gradeColumns', '[]'::jsonb)
       is distinct from
     coalesce(new.payload->'settings'->'gradeColumns', '[]'::jsonb)
     and not (
       actor.role in ('admin', 'trainer')
       and coalesce(actor.permissions->'grade'->>'edit', 'false') = 'true'
     ) then
    raise exception 'Grade edit permission required: gradeColumns' using errcode = '42501';
  end if;
  for key in select unnest(array['programs','rooms','timetableSlots']) loop
    perform public.assert_center_entity_permissions(old.payload->key, new.payload->key,
      jsonb_build_object('entity', public.center_academic_crud(actor.permissions, case when key = 'timetableSlots' then 'classes' else key end)),
      'entity', 'add', 'edit', 'delete');
  end loop;
  perform public.assert_center_entity_permissions(old.payload->'students', new.payload->'students', actor.permissions, 'student', 'add', 'edit', 'delete', array['feeStatus']);
  perform public.assert_center_entity_permissions(old.payload->'teachers', new.payload->'teachers', jsonb_set(actor.permissions, '{teacher}', coalesce(actor.permissions->'teacher','{}'::jsonb) || jsonb_build_object('add', coalesce(actor.permissions->'teacher'->'add', actor.permissions->'teacher'->'edit', 'false'::jsonb))), 'teacher', 'add', 'edit', 'delete', array['assignedClassIds']);
  perform public.assert_center_entity_permissions(old.payload->'receipts', new.payload->'receipts', actor.permissions, 'tuition', 'collect', 'collect', 'delete');
  if exists(
    select 1
    from jsonb_array_elements(coalesce(old.payload->'grades','[]'::jsonb)) b
    full join jsonb_array_elements(coalesce(new.payload->'grades','[]'::jsonb)) a on b.value->>'id' = a.value->>'id'
    where b.value is distinct from a.value
      and (b.value is null or a.value is null or (b.value - 'comment') is distinct from (a.value - 'comment'))
  ) then
    perform public.assert_center_entity_permissions(old.payload->'grades', new.payload->'grades', actor.permissions, 'grade', 'edit', 'edit', 'edit');
  elsif old.payload->'grades' is distinct from new.payload->'grades'
    and coalesce(actor.permissions->'student'->>'view','false') <> 'true' then
    raise exception 'Student view permission required for grade comments' using errcode = '42501';
  end if;
  perform public.assert_center_entity_permissions(old.payload->'classes', new.payload->'classes', jsonb_build_object('class', public.center_academic_crud(actor.permissions, 'classes')), 'class', 'add', 'edit', 'delete', array['studentIds']);

  for item in select value from jsonb_array_elements(coalesce(old.payload->'classes','[]'::jsonb)) c
    where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) n where n->>'id'=c.value->>'id')
  loop
    for key in select unnest(array['students','receipts','grades','attendanceSessions','enrollments','scheduleChanges']) loop
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where (v->>'classId'=item->>'id' or key = 'students' and public.center_student_class_ids(v) ? (item->>'id'))) then
        raise exception 'Class history must be preserved' using errcode = '42501';
      end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(old.payload->'rooms','[]'::jsonb)) r
    where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'rooms','[]'::jsonb)) n where n->>'id'=r.value->>'id')
  loop
    for key in select unnest(array['classes','timetableSlots','scheduleChanges']) loop
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where v->>'roomId'=item->>'id') then
        raise exception 'Room references must be preserved' using errcode = '42501';
      end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(old.payload->'programs','[]'::jsonb)) p
    where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'programs','[]'::jsonb)) n where n->>'id'=p.value->>'id')
  loop
    for key in select unnest(array['classes','students']) loop
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where v->>'programId'=item->>'id') then
        raise exception 'Program references must be preserved' using errcode = '42501';
      end if;
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) loop
    select coalesce(sum((r.value->>'paidAmount')::numeric),0), coalesce(sum((r.value->>'debtAmount')::numeric),0) into paid,debt
    from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) r where r.value->>'studentId' = item->>'id';
    debt := debt + public.center_unbilled_session_debt(new.payload, item->>'id');
    if coalesce(item->>'feeStatus','') <> (case when debt > 0 then case when paid > 0 then 'partial' else 'debt' end else case when paid > 0 then 'paid' else 'unpaid' end end) then raise exception 'Invalid derived fee status' using errcode = '22023'; end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) loop
    select coalesce(jsonb_agg(s.value->'id' order by s.value->>'id'), '[]'::jsonb) into expected
    from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where public.center_student_class_ids(s.value) ? (item->>'id');
    if expected is distinct from (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(item->'studentIds') v) then raise exception 'Invalid class roster' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'teachers','[]'::jsonb)) loop
    select coalesce(jsonb_agg(c.value->'id' order by c.value->>'id'), '[]'::jsonb) into expected
    from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c where c.value->>'teacherId' = item->>'id';
    if expected is distinct from (select coalesce(jsonb_agg(v order by v), '[]'::jsonb) from jsonb_array_elements(item->'assignedClassIds') v) then raise exception 'Invalid teacher assignment' using errcode = '22023'; end if;
  end loop;

  select array_agg(c.value->>'id') into allowed_classes
  from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c
  where actor.role in ('admin','trainer')
     or (actor.permissions->'assignedClassIds') ? (c.value->>'id')
     or (actor.permissions->>'teacherId' is not null and c.value->>'teacherId' = actor.permissions->>'teacherId');
  for attendance in
    select b.value as old_value, a.value as new_value
    from jsonb_array_elements(coalesce(old.payload->'attendanceSessions', '[]'::jsonb)) b
    full join jsonb_array_elements(coalesce(new.payload->'attendanceSessions', '[]'::jsonb)) a on b.value->>'id' = a.value->>'id'
    where b.value is distinct from a.value
  loop
    if not (coalesce(actor.permissions->'student'->>'edit','false') = 'true' or coalesce(actor.permissions->'teacher'->>'edit','false') = 'true')
       or attendance.new_value is null
       or not (
         coalesce(attendance.new_value->>'classId' = any(allowed_classes), false)
         or public.center_is_attendance_substitute(actor.permissions, actor.email, old.payload, attendance.new_value)
       )
       or (
         attendance.old_value is not null
         and not (
           coalesce(attendance.old_value->>'classId' = any(allowed_classes), false)
           or public.center_is_attendance_substitute(actor.permissions, actor.email, old.payload, attendance.old_value)
         )
       ) then
      raise exception 'Attendance permission denied' using errcode = '42501';
    end if;
  end loop;
  if old.payload->'grades' is distinct from new.payload->'grades' then
    for attendance in
      select b.value as old_value, a.value as new_value
      from jsonb_array_elements(coalesce(old.payload->'grades','[]'::jsonb)) b
      full join jsonb_array_elements(coalesce(new.payload->'grades','[]'::jsonb)) a on b.value->>'id' = a.value->>'id'
      where b.value is distinct from a.value
        and (b.value is null or a.value is null or (b.value - 'comment') is distinct from (a.value - 'comment'))
    loop
      if not coalesce(coalesce(attendance.new_value, attendance.old_value)->>'classId' = any(allowed_classes), false) then raise exception 'Class grade permission denied' using errcode = '42501'; end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_center_data_permissions() from public;
