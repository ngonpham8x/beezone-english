-- Run after 006. Adds validation/permissions for optional operational fields.
-- No existing rows are replaced and legacy payloads remain supported.
create or replace function public.assert_optional_center_date(value jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if value is null then return; end if;
  if jsonb_typeof(value) <> 'string' or (value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
     or to_char((value #>> '{}')::date, 'YYYY-MM-DD') <> (value #>> '{}') then
    raise exception 'Invalid operation date' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.assert_optional_center_date(jsonb) from public;

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
  if coalesce(old.payload->'scheduleChanges','[]'::jsonb) is distinct from coalesce(new.payload->'scheduleChanges','[]'::jsonb) then raise exception 'Owner permission required: scheduleChanges' using errcode = '42501'; end if;
  permissions := jsonb_set(coalesce(actor.permissions,'{}'::jsonb), '{student}', coalesce(actor.permissions->'student','{}'::jsonb) || jsonb_build_object('history', coalesce(actor.permissions->'student'->>'edit','false')='true' or coalesce(actor.permissions->'student'->>'add','false')='true'));
  perform public.assert_center_entity_permissions(old.payload->'enrollments',new.payload->'enrollments',permissions,'student','history','edit','delete');
  return new;
end;
$$;
revoke all on function public.guard_center_operations() from public;
create trigger center_data_guard_operations before insert or update on public.center_data
for each row execute function public.guard_center_operations();
