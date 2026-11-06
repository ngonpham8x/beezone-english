-- Migration 035: validate the optional guardian privacy-consent index stored on
-- a student and keep that personal record out of redacted teacher/trainer views.
begin;

create or replace function public.guard_student_guardian_consents()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  student jsonb;
  consent jsonb;
  recorded_date date;
  withdrawn_date date;
begin
  for student in select value from jsonb_array_elements(coalesce(new.payload->'students', '[]'::jsonb)) loop
    if not (student ? 'guardianConsent') then continue; end if;
    consent := student->'guardianConsent';
    if jsonb_typeof(consent) <> 'object'
       or jsonb_typeof(consent->'status') <> 'string'
       or coalesce(consent->>'status', '') not in ('confirmed', 'withdrawn')
       or jsonb_typeof(consent->'method') <> 'string'
       or coalesce(consent->>'method', '') not in ('paper', 'electronic', 'other')
       or jsonb_typeof(consent->'representativeName') <> 'string'
       or btrim(coalesce(consent->>'representativeName', '')) = ''
       or char_length(consent->>'representativeName') > 120
       or jsonb_typeof(consent->'recordedAt') <> 'string'
       or coalesce(consent->>'recordedAt', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (consent ? 'evidenceReference' and (
         jsonb_typeof(consent->'evidenceReference') <> 'string'
         or char_length(consent->>'evidenceReference') > 200
       ))
       or (consent ? 'note' and (
         jsonb_typeof(consent->'note') <> 'string'
         or char_length(consent->>'note') > 1000
       )) then
      raise exception 'Invalid guardian privacy consent record' using errcode = '22023';
    end if;

    begin
      recorded_date := (consent->>'recordedAt')::date;
    exception when others then
      raise exception 'Invalid guardian privacy consent date' using errcode = '22023';
    end;
    if to_char(recorded_date, 'YYYY-MM-DD') <> consent->>'recordedAt'
       or recorded_date > current_date then
      raise exception 'Invalid guardian privacy consent date' using errcode = '22023';
    end if;

    if consent->>'status' = 'withdrawn' then
      if coalesce(consent->>'withdrawnAt', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Invalid guardian privacy consent withdrawal date' using errcode = '22023';
      end if;
      begin
        withdrawn_date := (consent->>'withdrawnAt')::date;
      exception when others then
        raise exception 'Invalid guardian privacy consent withdrawal date' using errcode = '22023';
      end;
      if to_char(withdrawn_date, 'YYYY-MM-DD') <> consent->>'withdrawnAt'
         or withdrawn_date < recorded_date
         or withdrawn_date > current_date then
        raise exception 'Invalid guardian privacy consent withdrawal date' using errcode = '22023';
      end if;
    elsif nullif(consent->>'withdrawnAt', '') is not null then
      raise exception 'Confirmed guardian consent cannot have a withdrawal date' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists center_data_guard_guardian_consents on public.center_data;
create trigger center_data_guard_guardian_consents
before insert or update on public.center_data
for each row execute function public.guard_student_guardian_consents();

revoke all on function public.guard_student_guardian_consents() from public, anon, authenticated;

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

  return (p_student - 'guardianConsent')
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

notify pgrst, 'reload schema';
commit;
