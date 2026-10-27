-- Migration 026: enforce the fixed teacher-role ceiling on center_data writes.
-- Teachers may update attendance and grades for their assigned classes through
-- the existing guard, but cannot use legacy/custom flags to mutate student
-- profiles, admissions, academic catalogs, schedules, rooms or finance data.

create or replace function public.guard_teacher_role_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  key text;
begin
  if auth.role() = 'service_role' then return new; end if;

  select * into actor
  from public.profiles
  where id = auth.uid() and is_active;

  if actor.id is null then
    raise exception 'Inactive account' using errcode = '42501';
  end if;
  if actor.role <> 'teacher' then return new; end if;

  for key in
    select unnest(array[
      'teachers',
      'programs',
      'rooms',
      'classes',
      'timetableSlots',
      'scheduleChanges',
      'receipts',
      'enrollments',
      'settings',
      'backups'
    ])
  loop
    if old.payload->key is distinct from new.payload->key then
      raise exception 'Teacher role cannot update: %', key using errcode = '42501';
    end if;
  end loop;

  -- Attendance/session billing may legitimately recalculate feeStatus. Keep
  -- that derived field writable while rejecting every other student change,
  -- including additions, deletions and personal/contact/profile edits.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(old.payload->'students', '[]'::jsonb)) before
    full join jsonb_array_elements(coalesce(new.payload->'students', '[]'::jsonb)) after
      on before.value->>'id' = after.value->>'id'
    where before.value is null
       or after.value is null
       or (before.value - 'feeStatus') is distinct from (after.value - 'feeStatus')
  ) then
    raise exception 'Teacher role cannot update: students' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_teacher_role_scope() from public;

drop trigger if exists center_data_guard_teacher_scope on public.center_data;
create trigger center_data_guard_teacher_scope
before update on public.center_data
for each row execute function public.guard_teacher_role_scope();
