-- Migration 029: validate program-scoped UNIT/assessment columns and soft deletion.
-- Run after 028_grade_semesters.sql. The application keeps archived score values
-- for history but excludes archived columns from entry screens and averages.

create or replace function public.validate_gradebook_payload()
returns trigger language plpgsql security definer set search_path = public as $$
declare item jsonb; unit_entry record; column_item jsonb;
begin
  if jsonb_typeof(coalesce(new.payload->'grades', '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid grades array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(new.payload->'grades', '[]'::jsonb)) loop
    if coalesce(item->>'studentId', '') = '' or coalesce(item->>'classId', '') = ''
       or coalesce(item->>'semester', 'GKI') not in ('GKI', 'CKI', 'GKII', 'CKII') then
      raise exception 'Invalid grade semester or relation' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(array['listening','speaking','reading','writing','midterm','finalExam','attendance','average']) key
      where jsonb_typeof(item->key) is distinct from 'number'
        or (item->>key)::numeric < 0 or (item->>key)::numeric > 10
    ) then
      raise exception 'Grade score must be between 0 and 10' using errcode = '22023';
    end if;
    if item ? 'readingWriting' and (
      jsonb_typeof(item->'readingWriting') is distinct from 'number'
      or (item->>'readingWriting')::numeric < 0
      or (item->>'readingWriting')::numeric > 10
    ) then
      raise exception 'Invalid readingWriting score' using errcode = '22023';
    end if;
    if item ? 'unitScores' then
      if jsonb_typeof(item->'unitScores') <> 'object' then
        raise exception 'Invalid unitScores' using errcode = '22023';
      end if;
      for unit_entry in select * from jsonb_each(item->'unitScores') loop
        if unit_entry.key = '' or char_length(unit_entry.key) > 100
           or jsonb_typeof(unit_entry.value) is distinct from 'number'
           or (unit_entry.value #>> '{}')::numeric < 0
           or (unit_entry.value #>> '{}')::numeric > 10 then
          raise exception 'Invalid unit score' using errcode = '22023';
        end if;
      end loop;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'grades', '[]'::jsonb)) grade
    group by grade->>'studentId', grade->>'classId', coalesce(grade->>'semester', 'GKI')
    having count(*) > 1
  ) then
    raise exception 'Duplicate grade for student, class and semester' using errcode = '22023';
  end if;

  if new.payload->'settings' ? 'gradeColumns' then
    if jsonb_typeof(new.payload->'settings'->'gradeColumns') <> 'array' then
      raise exception 'Invalid grade columns' using errcode = '22023';
    end if;
    for column_item in select value from jsonb_array_elements(new.payload->'settings'->'gradeColumns') loop
      if jsonb_typeof(column_item) <> 'object'
         or coalesce(column_item->>'id', '') = ''
         or coalesce(column_item->>'name', '') = ''
         or char_length(column_item->>'name') > 40
         or column_item->>'semester' not in ('GKI', 'CKI', 'GKII', 'CKII')
         or (column_item ? 'programId' and (jsonb_typeof(column_item->'programId') <> 'string' or coalesce(column_item->>'programId', '') = ''))
         or (column_item ? 'classId' and (jsonb_typeof(column_item->'classId') <> 'string' or coalesce(column_item->>'classId', '') = ''))
         or (column_item ? 'kind' and (jsonb_typeof(column_item->'kind') <> 'string' or column_item->>'kind' not in ('unit', 'assessment')))
         or (column_item ? 'archivedAt' and (jsonb_typeof(column_item->'archivedAt') <> 'string' or coalesce(column_item->>'archivedAt', '') = '')) then
        raise exception 'Invalid grade column' using errcode = '22023';
      end if;
      if column_item ? 'programId' and column_item->>'archivedAt' is null and not exists (
        select 1 from jsonb_array_elements(coalesce(new.payload->'programs', '[]'::jsonb)) program
        where program->>'id' = column_item->>'programId'
      ) then
        raise exception 'Grade column program does not exist' using errcode = '23503';
      end if;
    end loop;
    if exists (
      select 1
      from jsonb_array_elements(new.payload->'settings'->'gradeColumns') column_value
      group by column_value->>'id'
      having count(*) > 1
    ) or exists (
      select 1
      from jsonb_array_elements(new.payload->'settings'->'gradeColumns') column_value
      where column_value->>'archivedAt' is null
      group by column_value->>'semester',
        coalesce(
          column_value->>'programId',
          case when column_value->>'classId' is not null then concat('class:', column_value->>'classId') else 'all' end
        ),
        lower(btrim(column_value->>'name'))
      having count(*) > 1
    ) then
      raise exception 'Duplicate grade column' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_gradebook_payload_trigger on public.center_data;
create trigger validate_gradebook_payload_trigger
before insert or update of payload on public.center_data
for each row execute function public.validate_gradebook_payload();

revoke all on function public.validate_gradebook_payload() from public;
