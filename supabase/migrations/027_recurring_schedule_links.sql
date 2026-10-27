-- Migration 027: keep each recurring timetable slot linked to the teacher
-- assigned on its class. Existing legacy mismatches remain readable so they
-- can be repaired safely, but a changed class/slot cannot introduce or retain
-- a mismatch. Dated schedule changes and attendance history are not deleted.

create or replace function public.guard_recurring_schedule_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then return new; end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'timetableSlots', '[]'::jsonb)) slot
    left join jsonb_array_elements(coalesce(new.payload->'classes', '[]'::jsonb)) classroom
      on classroom->>'id' = slot->>'classId'
    left join jsonb_array_elements(coalesce(old.payload->'timetableSlots', '[]'::jsonb)) old_slot
      on old_slot->>'id' = slot->>'id'
    left join jsonb_array_elements(coalesce(old.payload->'classes', '[]'::jsonb)) old_classroom
      on old_classroom->>'id' = slot->>'classId'
    where (
      classroom is null
      or coalesce(classroom->>'teacherId', '') = ''
      or slot->>'teacherId' is distinct from classroom->>'teacherId'
    )
    and (
      old_slot is null
      or old_slot is distinct from slot
      or old_classroom->>'teacherId' is distinct from classroom->>'teacherId'
    )
  ) then
    raise exception 'Recurring timetable teacher must match class assignment' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_recurring_schedule_links() from public;

drop trigger if exists center_data_guard_recurring_schedule_links on public.center_data;
create trigger center_data_guard_recurring_schedule_links
before update on public.center_data
for each row execute function public.guard_recurring_schedule_links();
