-- Run after 011. Adds multi-class validation and roster rules; does not modify stored records.
create or replace function public.center_student_class_ids(student jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(distinct id), '[]'::jsonb)
  from jsonb_array_elements(jsonb_build_array(coalesce(student->>'classId','')) || coalesce(student->'additionalClassIds','[]'::jsonb)) id
  where id <> '""'::jsonb;
$$;
revoke all on function public.center_student_class_ids(jsonb) from public;

create or replace function public.guard_student_class_memberships()
returns trigger language plpgsql security definer set search_path = public as $$
declare student jsonb; before_student jsonb; classroom jsonb; expected jsonb;
begin
  for student in select value from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) loop
    if student ? 'additionalClassIds' then
      if jsonb_typeof(student->'additionalClassIds') <> 'array' then raise exception 'Invalid additional classes' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements(student->'additionalClassIds') id where jsonb_typeof(id) <> 'string' or trim(id #>> '{}') = '' or id #>> '{}' = student->>'classId')
        or (select count(*) <> count(distinct id) from jsonb_array_elements(student->'additionalClassIds') id)
        or (jsonb_array_length(student->'additionalClassIds') > 0 and coalesce(student->>'classId','') = '') then
        raise exception 'Invalid additional classes' using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements(student->'additionalClassIds') id where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) c where c->>'id' = id #>> '{}')) then
        raise exception 'Missing additional class reference' using errcode='22023';
      end if;
    end if;
    if tg_op = 'UPDATE' then
      select value into before_student from jsonb_array_elements(coalesce(old.payload->'students','[]'::jsonb)) s where s->>'id' = student->>'id';
      if before_student ? 'additionalClassIds' and not (student ? 'additionalClassIds') then raise exception 'Client update required: student memberships missing' using errcode='22023'; end if;
    end if;
  end loop;
  -- Even an old owner client must not replace multi-class rosters with primary-only lists.
  if exists(select 1 from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where jsonb_array_length(coalesce(s->'additionalClassIds','[]'::jsonb)) > 0) then
    for classroom in select value from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) loop
      select coalesce(jsonb_agg(s->'id' order by s->>'id'), '[]'::jsonb) into expected from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where public.center_student_class_ids(s) ? (classroom->>'id');
      if expected is distinct from (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from jsonb_array_elements(coalesce(classroom->'studentIds','[]'::jsonb)) id) then raise exception 'Invalid multi-class roster' using errcode='22023'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_student_class_memberships() from public;
create trigger center_data_guard_00_memberships before insert or update on public.center_data
for each row execute function public.guard_student_class_memberships();

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
      if exists(select 1 from jsonb_array_elements(coalesce(old.payload->key,'[]'::jsonb)) v where (v->>'classId'=item->>'id' or key = 'students' and public.center_student_class_ids(v) ? (item->>'id'))) then
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

create or replace function public.guard_session_billing()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor public.profiles; c jsonb; a jsonb; previous jsonb; r jsonb; l jsonb; price numeric; total numeric; policy text; payment jsonb;
begin
  if new.payload ? 'sessionBillingVersion' and new.payload->'sessionBillingVersion' <> '1'::jsonb then raise exception 'Invalid session billing version' using errcode='22023'; end if;
  if tg_op='UPDATE' and old.payload ? 'sessionBillingVersion' and not (new.payload ? 'sessionBillingVersion') then raise exception 'Client update required: session billing version missing' using errcode='22023'; end if;
  for c in select value from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) loop
    if c ? 'billingMode' and coalesce(c->>'billingMode','') not in ('course','monthly','session') then raise exception 'Invalid billing mode' using errcode='22023'; end if;
    if c ? 'sessionRate' and (jsonb_typeof(c->'sessionRate') <> 'number' or (c->>'sessionRate')::numeric <= 0 or (c->>'sessionRate')::numeric > 1000000000 or (c->>'sessionRate')::numeric <> trunc((c->>'sessionRate')::numeric)) then raise exception 'Invalid session rate' using errcode='22023'; end if;
    if c ? 'sessionAbsencePolicy' and coalesce(c->>'sessionAbsencePolicy','') not in ('attended','unexcused','all') then raise exception 'Invalid absence policy' using errcode='22023'; end if;
    perform public.assert_optional_center_date(c->'sessionBillingStartDate');
    if c->>'billingMode'='session' and (not (c ? 'sessionRate') or not (c ? 'sessionBillingStartDate')) then raise exception 'Session class needs rate and start date' using errcode='22023'; end if;
  end loop;
  if auth.role()<>'service_role' then select * into actor from public.profiles where id=auth.uid() and is_active; end if;
  if tg_op='UPDATE' and actor.role is distinct from 'owner' and auth.role()<>'service_role' then
    for previous in select value from jsonb_array_elements(coalesce(old.payload->'attendanceSessions','[]'::jsonb)) where value ? 'billing' loop
      select value into a from jsonb_array_elements(coalesce(new.payload->'attendanceSessions','[]'::jsonb)) where value->>'id'=previous->>'id';
      if a is null or not (a ? 'billing') then raise exception 'Cannot remove billing snapshot' using errcode='42501'; end if;
    end loop;
  end if;
  for a in select value from jsonb_array_elements(coalesce(new.payload->'attendanceSessions','[]'::jsonb)) loop
    if not (a ? 'billing') then
      if actor.role is distinct from 'owner' and auth.role()<>'service_role' and not exists(select 1 from jsonb_array_elements(case when tg_op='UPDATE' then coalesce(old.payload->'attendanceSessions','[]'::jsonb) else '[]'::jsonb end) original where original->>'id'=a->>'id')
        and exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) configured where configured->>'id'=a->>'classId' and configured->>'billingMode'='session' and a->>'date'>=configured->>'sessionBillingStartDate') then raise exception 'New session requires billing snapshot' using errcode='22023'; end if;
      continue;
    end if;
    perform public.assert_optional_center_date(a->'date');
    if not (a ? 'date') or a->>'date' > to_char(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD') then raise exception 'Cannot bill future attendance' using errcode='22023'; end if;
    if jsonb_typeof(a->'billing') <> 'object' or jsonb_typeof(a->'billing'->'unitPrice') <> 'number' then raise exception 'Invalid billing snapshot' using errcode='22023'; end if;
    price := (a->'billing'->>'unitPrice')::numeric; policy := a->'billing'->>'absencePolicy';
    if price<=0 or price>1000000000 or price<>trunc(price) or coalesce(policy,'') not in ('attended','unexcused','all') then raise exception 'Invalid billing snapshot' using errcode='22023'; end if;
    if jsonb_typeof(a->'entries') <> 'array' or exists(select 1 from jsonb_array_elements(a->'entries') e where coalesce(e->>'studentId','')='' or coalesce(e->>'status','') not in ('present','late','absent','excused'))
      or (select count(*)<>count(distinct e->>'studentId') from jsonb_array_elements(a->'entries') e) then raise exception 'Invalid billable attendance entries' using errcode='22023'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) configured where configured->>'id'=a->>'classId')
      or exists(select 1 from jsonb_array_elements(a->'entries') e where not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where s->>'id'=e->>'studentId')) then raise exception 'Missing billed class or student' using errcode='22023'; end if;
    if (select count(*) from jsonb_array_elements(coalesce(new.payload->'attendanceSessions','[]'::jsonb)) other where other->>'classId'=a->>'classId' and other->>'date'=a->>'date')>1 then raise exception 'Duplicate class attendance date' using errcode='22023'; end if;
    select value into previous from jsonb_array_elements(case when tg_op='UPDATE' then coalesce(old.payload->'attendanceSessions','[]'::jsonb) else '[]'::jsonb end) where value->>'id'=a->>'id';
    if previous ? 'billing' then
      if previous->'billing' is distinct from a->'billing' then raise exception 'Historical session price is immutable' using errcode='22023'; end if;
      if previous->>'classId' is distinct from a->>'classId' or previous->>'date' is distinct from a->>'date' then raise exception 'Billing session identity is immutable' using errcode='22023'; end if;
    else
      select value into c from jsonb_array_elements(coalesce(new.payload->'classes','[]'::jsonb)) where value->>'id'=a->>'classId';
      if actor.role is distinct from 'owner' and auth.role()<>'service_role' and (c is null or coalesce(c->>'billingMode','')<>'session' or a->>'date'<c->>'sessionBillingStartDate' or price<>(c->>'sessionRate')::numeric or policy<>coalesce(c->>'sessionAbsencePolicy','attended')) then raise exception 'Snapshot does not match class billing configuration' using errcode='22023'; end if;
      if previous is not null and actor.role is distinct from 'owner' and auth.role()<>'service_role' then raise exception 'Only owner can enable historical lesson billing' using errcode='42501'; end if;
    end if;
    if actor.role is distinct from 'owner' and auth.role()<>'service_role' and exists(
      select 1 from jsonb_array_elements(a->'entries') e where
      not exists(select 1 from jsonb_array_elements(coalesce(previous->'entries','[]'::jsonb)) original where original->>'studentId'=e->>'studentId')
      and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'enrollments','[]'::jsonb)) membership where membership->>'studentId'=e->>'studentId' and membership->>'classId'=a->>'classId' and membership->>'status' <> 'reserved' and (not (membership ? 'startDate') or membership->>'startDate'<=a->>'date') and (not (membership ? 'endDate') and membership->>'status'='active' or membership->>'endDate'>a->>'date' or membership->>'status'='completed' and membership->>'endDate'=a->>'date'))
      and not (not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'enrollments','[]'::jsonb)) membership where membership->>'studentId'=e->>'studentId' and membership->>'classId'=a->>'classId') and exists(select 1 from jsonb_array_elements(coalesce(new.payload->'students','[]'::jsonb)) s where s->>'id'=e->>'studentId' and public.center_student_class_ids(s) ? (a->>'classId') and s->>'status'='active'))
    ) then raise exception 'Student is not enrolled in billed class' using errcode='42501'; end if;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) loop
    if r ? 'paymentKind' and coalesce(r->>'paymentKind','') not in ('course','monthly','session') then raise exception 'Invalid receipt kind' using errcode='22023'; end if;
    if r->>'paymentKind'<>'session' or not (r ? 'paymentKind') then continue; end if;
    if jsonb_typeof(r->'sessionLines') is distinct from 'array' or jsonb_array_length(r->'sessionLines')=0 then raise exception 'Missing session receipt lines' using errcode='22023'; end if;
    total:=0;
    for l in select value from jsonb_array_elements(r->'sessionLines') loop
      select value into a from jsonb_array_elements(coalesce(new.payload->'attendanceSessions','[]'::jsonb)) where value->>'id'=l->>'attendanceSessionId';
      if a is null or not (a ? 'billing') or a->>'classId' is distinct from r->>'classId' or a->>'date' is distinct from l->>'date' or a->'billing'->'unitPrice' is distinct from l->'unitPrice'
        or not exists(select 1 from jsonb_array_elements(coalesce(a->'entries','[]'::jsonb)) e where e->>'studentId'=r->>'studentId' and public.center_session_chargeable(e->>'status',a->'billing'->>'absencePolicy')) then raise exception 'Invalid session receipt reference' using errcode='22023'; end if;
      total:=total+(l->>'unitPrice')::numeric;
      if (select count(*) from jsonb_array_elements(coalesce(new.payload->'receipts','[]'::jsonb)) other cross join lateral jsonb_array_elements(coalesce(other->'sessionLines','[]'::jsonb)) line
        where other->>'paymentKind'='session' and other->>'studentId'=r->>'studentId' and line->>'attendanceSessionId'=l->>'attendanceSessionId')<>1 then raise exception 'Session already billed' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(r->'sessionFee') is distinct from 'number' or (r->>'sessionFee')::numeric<>total or coalesce((r->>'courseFee')::numeric,0)<>0 or coalesce((r->>'monthlyFee')::numeric,0)<>0
      or jsonb_typeof(r->'discount') is distinct from 'number' or jsonb_typeof(r->'paidAmount') is distinct from 'number' or jsonb_typeof(r->'debtAmount') is distinct from 'number'
      or (r->>'discount')::numeric<>trunc((r->>'discount')::numeric) or (r->>'paidAmount')::numeric<>trunc((r->>'paidAmount')::numeric)
      or coalesce((r->>'discount')::numeric,-1)<0 or (r->>'discount')::numeric>total or coalesce((r->>'paidAmount')::numeric,-1)<0 or (r->>'paidAmount')::numeric>total-(r->>'discount')::numeric
      or coalesce((r->>'debtAmount')::numeric,-1)<>total-(r->>'discount')::numeric-(r->>'paidAmount')::numeric then raise exception 'Invalid session receipt amount' using errcode='22023'; end if;
    perform public.assert_optional_center_date(r->'paymentDate');
    if not (r ? 'paymentDate') then raise exception 'Missing session payment date' using errcode='22023'; end if;
    if r ? 'installments' then
      if jsonb_typeof(r->'installments') is distinct from 'array' then raise exception 'Invalid session payments' using errcode='22023'; end if;
      total:=0;
      for payment in select value from jsonb_array_elements(r->'installments') loop
        if jsonb_typeof(payment->'amount') is distinct from 'number' or (payment->>'amount')::numeric<0 or (payment->>'amount')::numeric<>trunc((payment->>'amount')::numeric) or not (payment ? 'date') then raise exception 'Invalid session payments' using errcode='22023'; end if;
        perform public.assert_optional_center_date(payment->'date');
        total:=total+(payment->>'amount')::numeric;
      end loop;
      if total>(r->>'paidAmount')::numeric then raise exception 'Session payments exceed collected amount' using errcode='22023'; end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_session_billing() from public;
