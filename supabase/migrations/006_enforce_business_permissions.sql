-- Enforce write permissions on the shared document, independently of the UI.
-- Apply after 001–005. Existing data is preserved.
create or replace function public.assert_center_entity_permissions(
  before_items jsonb, after_items jsonb, permissions jsonb, module_name text,
  add_action text default 'add', edit_action text default 'edit', delete_action text default 'delete',
  ignored_fields text[] default '{}'::text[]
) returns void language plpgsql set search_path = public as $$
declare item record;
begin
  if jsonb_typeof(coalesce(before_items, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(after_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid entity array' using errcode = '22023';
  end if;
  for item in
    select b.value as old_value, a.value as new_value
    from jsonb_array_elements(coalesce(before_items, '[]'::jsonb)) b
    full join jsonb_array_elements(coalesce(after_items, '[]'::jsonb)) a on b.value->>'id' = a.value->>'id'
  loop
    if item.old_value is null then
      if coalesce(permissions->module_name->>add_action, 'false') <> 'true' then raise exception 'Entity creation denied: %', module_name using errcode = '42501'; end if;
    elsif item.new_value is null then
      if coalesce(permissions->module_name->>delete_action, 'false') <> 'true' then raise exception 'Entity deletion denied: %', module_name using errcode = '42501'; end if;
    elsif (item.old_value - ignored_fields) is distinct from (item.new_value - ignored_fields) then
      if coalesce(permissions->module_name->>edit_action, 'false') <> 'true' then raise exception 'Entity update denied: %', module_name using errcode = '42501'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.assert_center_entity_permissions(jsonb,jsonb,jsonb,text,text,text,text,text[]) from public;

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

  for key in select unnest(array['settings','programs','rooms','timetableSlots','backups']) loop
    if old.payload->key is distinct from new.payload->key then raise exception 'Owner permission required: %', key using errcode = '42501'; end if;
  end loop;
  perform public.assert_center_entity_permissions(old.payload->'students', new.payload->'students', actor.permissions, 'student', 'add', 'edit', 'delete', array['feeStatus']);
  perform public.assert_center_entity_permissions(old.payload->'teachers', new.payload->'teachers', actor.permissions, 'teacher', 'edit', 'edit', 'delete', array['assignedClassIds']);
  perform public.assert_center_entity_permissions(old.payload->'receipts', new.payload->'receipts', actor.permissions, 'tuition', 'collect', 'collect', 'delete');
  perform public.assert_center_entity_permissions(old.payload->'grades', new.payload->'grades', actor.permissions, 'grade', 'edit', 'edit', 'edit');
  perform public.assert_center_entity_permissions(old.payload->'classes', new.payload->'classes', '{}'::jsonb, 'class', 'add', 'edit', 'delete', array['studentIds']);

  -- feeStatus is derived, but cannot be used as an unchecked permission bypass.
  for item in select value from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) loop
    select coalesce(sum((r.value->>'paidAmount')::numeric),0), coalesce(sum((r.value->>'debtAmount')::numeric),0) into paid,debt
    from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) r where r.value->>'studentId' = item->>'id';
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
create trigger center_data_guard_permissions before insert or update on public.center_data
for each row execute function public.guard_center_data_permissions();

-- Serialize owner deactivations/demotions/deletions so simultaneous requests
-- cannot remove the final active owner after both observe an old count.
create or replace function public.guard_final_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and old.is_active then
    if tg_op = 'DELETE' then
      perform pg_advisory_xact_lock(78201401);
      if (select count(*) from public.profiles where role = 'owner' and is_active) <= 1 then raise exception 'Cannot delete final owner' using errcode = '23514'; end if;
    elsif new.role <> 'owner' or not new.is_active then
      perform pg_advisory_xact_lock(78201401);
      if (select count(*) from public.profiles where role = 'owner' and is_active) <= 1 then raise exception 'Cannot remove final owner' using errcode = '23514'; end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_final_owner() from public;
create trigger profiles_guard_final_owner before update or delete on public.profiles
for each row execute function public.guard_final_owner();
