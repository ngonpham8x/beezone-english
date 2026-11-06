-- Migration 034: never expose the complete centre document to every active account.
-- Reads and writes go through scoped, consent-aware RPCs. The underlying JSON row
-- remains protected by the existing validation, permission, history and quota triggers.
begin;

create or replace function public.bz_center_has_current_consent(
  p_user_id uuid,
  p_policy_version text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.privacy_consents consent
    where consent.user_id = p_user_id
      and consent.policy_version = p_policy_version
      and consent.consented_at is not null
      and consent.withdrawn_at is null
      and consent.purposes @> array['authentication', 'center-operations', 'security-audit']::text[]
  );
$$;

create or replace function public.bz_center_redact_student(
  p_student jsonb,
  p_allowed_classes text[] default null
) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  memberships text[];
  primary_class text;
  filtered_codes jsonb := '{}'::jsonb;
begin
  select coalesce(array_agg(membership.class_id), array[]::text[])
    into memberships
  from jsonb_array_elements_text(public.center_student_class_ids(p_student)) membership(class_id)
  where p_allowed_classes is null or membership.class_id = any(p_allowed_classes);

  if cardinality(memberships) = 0 then return null; end if;
  primary_class := case
    when p_student->>'classId' = any(memberships) then p_student->>'classId'
    else memberships[1]
  end;

  select coalesce(jsonb_object_agg(entry.class_id, entry.code_value), '{}'::jsonb)
    into filtered_codes
  from jsonb_each(coalesce(p_student->'classStudentCodes', '{}'::jsonb)) entry(class_id, code_value)
  where entry.class_id = any(memberships);

  return p_student
    || jsonb_build_object(
      'code', coalesce(filtered_codes->>primary_class, ''),
      'classId', primary_class,
      'additionalClassIds', to_jsonb(array_remove(memberships, primary_class)),
      'classStudentCodes', filtered_codes,
      'avatar', '',
      'dob', '',
      'school', '',
      'address', '',
      'email', '',
      'phone', '',
      'parentName', '',
      'parentPhone', '',
      'notes', '',
      'feeStatus', 'unpaid'
    );
end;
$$;

create or replace function public.bz_center_scoped_payload(
  p_payload jsonb,
  p_actor public.profiles
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed_classes text[];
  allowed_programs text[];
  allowed_rooms text[];
  allowed_teachers text[];
  result jsonb := p_payload;
  scoped_students jsonb;
  scoped_settings jsonb;
  show_personal boolean;
  show_receipts boolean;
begin
  if p_actor.role = 'owner' then return p_payload; end if;

  show_personal := p_actor.role = 'admin'
    and coalesce(p_actor.permissions->'student'->>'view', 'false') = 'true';
  show_receipts := p_actor.role = 'admin' and (
    coalesce(p_actor.permissions->'tuition'->>'view', 'false') = 'true'
    or coalesce(p_actor.permissions->'tuition'->>'collect', 'false') = 'true'
    or coalesce(p_actor.permissions->'tuition'->>'delete', 'false') = 'true'
    or coalesce(p_actor.permissions->'tuition'->>'showDebt', 'false') = 'true'
    or coalesce(p_actor.permissions->'report'->>'revenue', 'false') = 'true'
  );

  if p_actor.role in ('admin', 'trainer') then
    select coalesce(array_agg(item->>'id'), array[]::text[])
      into allowed_classes
    from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) item;
  else
    select coalesce(array_agg(item->>'id'), array[]::text[])
      into allowed_classes
    from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) item
    where coalesce(p_actor.permissions->'assignedClassIds', '[]'::jsonb) ? (item->>'id')
       or (nullif(p_actor.permissions->>'teacherId', '') is not null
           and item->>'teacherId' = p_actor.permissions->>'teacherId');
  end if;

  select coalesce(array_agg(distinct program_id), array[]::text[])
    into allowed_programs
  from (
    select item->>'programId' as program_id
    from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) item
    where item->>'id' = any(allowed_classes)
    union all
    select additional_program.program_id
    from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) item,
         jsonb_array_elements_text(coalesce(item->'additionalProgramIds', '[]'::jsonb)) additional_program(program_id)
    where item->>'id' = any(allowed_classes)
  ) programs
  where nullif(program_id, '') is not null;

  select coalesce(array_agg(distinct item->>'roomId'), array[]::text[]),
         coalesce(array_agg(distinct item->>'teacherId'), array[]::text[])
    into allowed_rooms, allowed_teachers
  from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) item
  where item->>'id' = any(allowed_classes);

  select coalesce(jsonb_agg(
      case when show_personal then student else
        student_view.value || jsonb_build_object(
          'programId', coalesce(primary_class.item->>'programId', student_view.value->>'programId'),
          'additionalProgramIds', '[]'::jsonb
        )
      end
    ), '[]'::jsonb)
    into scoped_students
  from jsonb_array_elements(coalesce(p_payload->'students', '[]'::jsonb)) student,
       lateral public.bz_center_redact_student(student, allowed_classes) student_view(value)
  left join lateral (
    select class_row.item
    from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) class_row(item)
    where class_row.item->>'id' = student_view.value->>'classId'
    limit 1
  ) primary_class(item) on true
  where student_view.value is not null;

  scoped_settings := coalesce(p_payload->'settings', '{}'::jsonb)
    || jsonb_build_object(
      'adminReportEmail', '',
      'autoEmailReport', false,
      'autoBackup', false,
      'emailBackupApprovedAt', '',
      'emailBackupApprovedRecipient', '',
      'sheetsConfig', '{}'::jsonb,
      'gradeColumns', coalesce((
        select jsonb_agg(column_value)
        from jsonb_array_elements(coalesce(p_payload->'settings'->'gradeColumns', '[]'::jsonb)) column_value
        where (column_value->>'programId' is null or column_value->>'programId' = any(allowed_programs))
          and (column_value->>'classId' is null or column_value->>'classId' = any(allowed_classes))
      ), '[]'::jsonb)
    );

  result := jsonb_set(result, '{settings}', scoped_settings, true);
  result := jsonb_set(result, '{programs}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'programs', '[]'::jsonb)) item
    where p_actor.role in ('admin', 'trainer') or item->>'id' = any(allowed_programs)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{teachers}', coalesce((
    select jsonb_agg(case when p_actor.role = 'teacher' then
      item || jsonb_build_object('phone', '', 'email', '', 'address', '', 'scheduleNotes', '', 'notes', '')
      else item end)
    from jsonb_array_elements(coalesce(p_payload->'teachers', '[]'::jsonb)) item
    where p_actor.role in ('admin', 'trainer') or item->>'id' = any(allowed_teachers)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{rooms}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'rooms', '[]'::jsonb)) item
    where p_actor.role in ('admin', 'trainer') or item->>'id' = any(allowed_rooms)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{classes}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'classes', '[]'::jsonb)) item
    where item->>'id' = any(allowed_classes)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{students}', scoped_students, true);

  result := jsonb_set(result, '{timetableSlots}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'timetableSlots', '[]'::jsonb)) item
    where item->>'classId' = any(allowed_classes)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{grades}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'grades', '[]'::jsonb)) item
    where item->>'classId' = any(allowed_classes)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{attendanceSessions}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'attendanceSessions', '[]'::jsonb)) item
    where item->>'classId' = any(allowed_classes)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{enrollments}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'enrollments', '[]'::jsonb)) item
    where item->>'classId' = any(allowed_classes)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{scheduleChanges}', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(p_payload->'scheduleChanges', '[]'::jsonb)) item
    where item->>'classId' = any(allowed_classes)
  ), '[]'::jsonb), true);
  result := jsonb_set(result, '{receipts}', case when show_receipts
    then coalesce(p_payload->'receipts', '[]'::jsonb) else '[]'::jsonb end, true);
  result := jsonb_set(result, '{backups}', '[]'::jsonb, true);
  result := jsonb_set(result, '{activityLogs}', '[]'::jsonb, true);
  return result;
end;
$$;

create or replace function public.bz_center_merge_records(
  p_old jsonb,
  p_new jsonb,
  p_allowed_classes text[]
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(record_value), '[]'::jsonb)
  from (
    select item as record_value
    from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) item
    where not coalesce(item->>'classId' = any(p_allowed_classes), false)
    union all
    select item
    from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) item
    where item->>'classId' = any(p_allowed_classes)
  ) records;
$$;

create or replace function public.bz_center_merge_activity_logs(
  p_old jsonb,
  p_new jsonb
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from (
    select old_item as item
    from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) old_item
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) new_item
      where new_item->>'id' = old_item->>'id'
    )
    union all
    select new_item from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) new_item
  ) logs;
$$;

create or replace function public.bz_get_center_snapshot(
  p_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  row_payload jsonb;
  row_revision timestamptz;
begin
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null then raise exception 'Active account required' using errcode = '42501'; end if;
  if not public.bz_center_has_current_consent(actor.id, p_policy_version) then
    raise exception 'Current privacy consent required' using errcode = '42501';
  end if;

  select payload, updated_at into row_payload, row_revision
  from public.center_data where id = 'primary';
  if not found then
    return jsonb_build_object('payload', '{}'::jsonb, 'updated_at', null);
  end if;
  return jsonb_build_object(
    'payload', public.bz_center_scoped_payload(row_payload, actor),
    'updated_at', row_revision
  );
end;
$$;

create or replace function public.bz_save_center_snapshot(
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  old_payload jsonb;
  new_payload jsonb;
  current_revision timestamptz;
  saved_revision timestamptz;
  allowed_classes text[];
  key text;
begin
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null then raise exception 'Active account required' using errcode = '42501'; end if;
  if not public.bz_center_has_current_consent(actor.id, p_policy_version) then
    raise exception 'Current privacy consent required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;

  select payload, updated_at into old_payload, current_revision
  from public.center_data where id = 'primary' for update;
  if not found then
    if actor.role <> 'owner' then raise exception 'Only owner can initialize centre data' using errcode = '42501'; end if;
    insert into public.center_data(id, payload) values ('primary', p_payload)
    returning updated_at into saved_revision;
    return jsonb_build_object('applied', true, 'updated_at', saved_revision);
  end if;
  if p_expected_updated_at is null or current_revision is distinct from p_expected_updated_at then
    return jsonb_build_object('applied', false, 'updated_at', current_revision);
  end if;

  if actor.role = 'owner' then
    new_payload := p_payload;
  elsif actor.role in ('admin', 'trainer') then
    new_payload := old_payload;
    foreach key in array array['programs','teachers','rooms','classes','timetableSlots','grades','attendanceSessions','enrollments','scheduleChanges'] loop
      new_payload := jsonb_set(new_payload, array[key], coalesce(p_payload->key, '[]'::jsonb), true);
    end loop;
    if actor.role = 'admin'
       and coalesce(actor.permissions->'student'->>'view', 'false') = 'true' then
      new_payload := jsonb_set(new_payload, '{students}', coalesce(p_payload->'students', '[]'::jsonb), true);
    end if;
    if actor.role = 'admin' and (
      coalesce(actor.permissions->'tuition'->>'view', 'false') = 'true'
      or coalesce(actor.permissions->'tuition'->>'collect', 'false') = 'true'
      or coalesce(actor.permissions->'tuition'->>'delete', 'false') = 'true'
      or coalesce(actor.permissions->'tuition'->>'showDebt', 'false') = 'true'
      or coalesce(actor.permissions->'report'->>'revenue', 'false') = 'true'
    ) then
      new_payload := jsonb_set(new_payload, '{receipts}', coalesce(p_payload->'receipts', '[]'::jsonb), true);
    end if;
    new_payload := jsonb_set(new_payload, '{activityLogs}', public.bz_center_merge_activity_logs(old_payload->'activityLogs', p_payload->'activityLogs'), true);
  else
    select coalesce(array_agg(item->>'id'), array[]::text[])
      into allowed_classes
    from jsonb_array_elements(coalesce(old_payload->'classes', '[]'::jsonb)) item
    where coalesce(actor.permissions->'assignedClassIds', '[]'::jsonb) ? (item->>'id')
       or (nullif(actor.permissions->>'teacherId', '') is not null
           and item->>'teacherId' = actor.permissions->>'teacherId');

    if exists (
      select 1 from jsonb_array_elements(coalesce(p_payload->'grades', '[]'::jsonb)) item
      where not coalesce(item->>'classId' = any(allowed_classes), false)
    ) or exists (
      select 1 from jsonb_array_elements(coalesce(p_payload->'attendanceSessions', '[]'::jsonb)) item
      where not coalesce(item->>'classId' = any(allowed_classes), false)
    ) then
      raise exception 'Class scope denied' using errcode = '42501';
    end if;
    new_payload := old_payload;
    new_payload := jsonb_set(new_payload, '{grades}', public.bz_center_merge_records(old_payload->'grades', p_payload->'grades', allowed_classes), true);
    new_payload := jsonb_set(new_payload, '{attendanceSessions}', public.bz_center_merge_records(old_payload->'attendanceSessions', p_payload->'attendanceSessions', allowed_classes), true);
    new_payload := jsonb_set(new_payload, '{activityLogs}', public.bz_center_merge_activity_logs(old_payload->'activityLogs', p_payload->'activityLogs'), true);
  end if;

  -- Attendance/session billing can change derived feeStatus. Recalculate it from
  -- the authoritative (unredacted) document before the existing guard validates it.
  new_payload := jsonb_set(new_payload, '{students}', coalesce((
    select jsonb_agg(
      jsonb_set(student, '{feeStatus}', to_jsonb(
        case
          when debt + public.center_unbilled_session_debt(new_payload, student->>'id') > 0
            then case when paid > 0 then 'partial' else 'debt' end
          else case when paid > 0 then 'paid' else 'unpaid' end
        end
      ), true)
    )
    from jsonb_array_elements(coalesce(new_payload->'students', '[]'::jsonb)) student
    cross join lateral (
      select coalesce(sum((receipt->>'paidAmount')::numeric), 0) as paid,
             coalesce(sum((receipt->>'debtAmount')::numeric), 0) as debt
      from jsonb_array_elements(coalesce(new_payload->'receipts', '[]'::jsonb)) receipt
      where receipt->>'studentId' = student->>'id'
    ) totals
  ), '[]'::jsonb), true);

  update public.center_data
  set payload = new_payload
  where id = 'primary' and updated_at = current_revision
  returning updated_at into saved_revision;
  if not found then return jsonb_build_object('applied', false, 'updated_at', current_revision); end if;
  return jsonb_build_object('applied', true, 'updated_at', saved_revision);
end;
$$;

revoke all on function public.bz_center_has_current_consent(uuid, text) from public, anon, authenticated;
revoke all on function public.bz_center_redact_student(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.bz_center_scoped_payload(jsonb, public.profiles) from public, anon, authenticated;
revoke all on function public.bz_center_merge_records(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.bz_center_merge_activity_logs(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.bz_get_center_snapshot(text) from public, anon;
revoke all on function public.bz_save_center_snapshot(jsonb, timestamptz, text) from public, anon;
grant execute on function public.bz_get_center_snapshot(text) to authenticated;
grant execute on function public.bz_save_center_snapshot(jsonb, timestamptz, text) to authenticated;

-- Column/table privileges are revoked after the RPCs exist so deployed clients
-- fail closed instead of receiving a complete payload. Metadata is still readable
-- for diagnostics, but normal client polling uses the scoped snapshot RPC.
revoke select, insert, update on table public.center_data from public, anon, authenticated;
grant select (id, updated_at, updated_by) on table public.center_data to authenticated;
grant select, insert, update on table public.center_data to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'center_data'
     ) then
    alter publication supabase_realtime drop table public.center_data;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
