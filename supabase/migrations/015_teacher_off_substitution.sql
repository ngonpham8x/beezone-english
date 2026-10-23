-- Run after 014. Accept dated teacher leave and validate the linked substitute.
-- This replaces only the operations guard; it does not change existing records or grants.
create or replace function public.guard_center_operations()
returns trigger language plpgsql security definer set search_path = public as $$
declare key text; item jsonb; source_slot jsonb; actor public.profiles; permissions jsonb;
  weekdays text[] := array['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ Nhật'];
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
    if not (item ? 'date') or coalesce(item->>'kind','') not in ('cancel','move','extra','teacher_off') or coalesce(trim(item->>'reason'),'') = '' then raise exception 'Invalid schedule change' using errcode = '22023'; end if;
    if (item->>'kind' <> 'extra' and coalesce(item->>'sourceSlotId','') = '') or (item->>'kind' = 'move' and not (item ? 'sourceDate')) then raise exception 'Missing source lesson' using errcode = '22023'; end if;
    if coalesce(item->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(item->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'startTime' >= item->>'endTime' then raise exception 'Invalid lesson time' using errcode = '22023'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c where c->>'id'=item->>'classId') then raise exception 'Missing schedule class' using errcode = '22023'; end if;
    if item->>'kind' = 'teacher_off' then
      select s.value into source_slot from jsonb_array_elements(coalesce(new.payload->'timetableSlots','[]'::jsonb)) s where s.value->>'id' = item->>'sourceSlotId';
      if source_slot is null or source_slot->>'classId' is distinct from item->>'classId'
         or source_slot->>'teacherId' is distinct from item->>'teacherId'
         or source_slot->>'startTime' is distinct from item->>'startTime'
         or source_slot->>'endTime' is distinct from item->>'endTime'
         or source_slot->>'dayOfWeek' is distinct from weekdays[extract(isodow from (item->>'date')::date)::integer] then
        raise exception 'Teacher leave must match the original lesson' using errcode = '22023';
      end if;
      if (select count(*) from jsonb_array_elements(coalesce(new.payload->'scheduleChanges','[]'::jsonb)) c
          where c->>'sourceSlotId' = item->>'sourceSlotId'
            and (case when c->>'kind' = 'move' then c->>'sourceDate' else c->>'date' end) = item->>'date') > 1 then
        raise exception 'Original lesson already has a dated adjustment' using errcode = '22023';
      end if;
      if item ? 'substituteTeacherId' then
        if jsonb_typeof(item->'substituteTeacherId') <> 'string'
           or coalesce(item->>'substituteTeacherId','') = ''
           or item->>'substituteTeacherId' = item->>'teacherId'
           or not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'teachers','[]'::jsonb)) t where t->>'id' = item->>'substituteTeacherId') then
          raise exception 'Invalid substitute teacher' using errcode = '22023';
        end if;
      end if;
    end if;
  end loop;
  if auth.role() = 'service_role' then return new; end if;
  select * into actor from public.profiles where id=auth.uid() and is_active;
  if actor.id is null then raise exception 'Inactive account' using errcode = '42501'; end if;
  if actor.role = 'owner' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Only owners can initialize operations' using errcode = '42501'; end if;
  perform public.assert_center_entity_permissions(old.payload->'scheduleChanges', new.payload->'scheduleChanges',
    jsonb_build_object('schedule', public.center_academic_crud(actor.permissions, 'classes')), 'schedule', 'add', 'edit', 'delete');
  permissions := jsonb_set(coalesce(actor.permissions,'{}'::jsonb), '{student}', coalesce(actor.permissions->'student','{}'::jsonb) || jsonb_build_object('history', coalesce(actor.permissions->'student'->>'edit','false')='true' or coalesce(actor.permissions->'student'->>'add','false')='true'));
  perform public.assert_center_entity_permissions(old.payload->'enrollments',new.payload->'enrollments',permissions,'student','history','edit','delete');
  return new;
end;
$$;
revoke all on function public.guard_center_operations() from public;
