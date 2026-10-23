-- BEEZONE WORK MODULE: cross-device synchronization.
-- Adds ONLY bz_work_* objects; no DROP or changes to existing BeeZone tables.
-- Run once in Supabase SQL Editor after reviewing the role mapping below.
BEGIN;
CREATE TABLE IF NOT EXISTS public.bz_work_people (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 150),
 email text,
 role text NOT NULL CHECK (role IN ('manager','admin','trainer','teacher')),
 active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.bz_work_people IS 'MODULE ACL projection: provision from existing BeeZone identities/roles, never self-register from frontend';

CREATE TABLE IF NOT EXISTS public.bz_work_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch text NOT NULL CHECK (branch IN ('admin','training')),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 220),
 description text NOT NULL DEFAULT '',
 assigned_uid uuid NOT NULL REFERENCES public.bz_work_people(user_id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
 shift_label text NOT NULL DEFAULT 'Ca chiều',
 class_label text NOT NULL DEFAULT '', -- replace/augment with FK to existing BeeZone classes AFTER code review
 class_id text,
 is_teacher_off boolean NOT NULL DEFAULT false,
 substitute_teacher_id text,
 schedule_change_id text,
 custom_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 ack text,
 ack_name text,
 ack_note text,
 priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
 status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','progress','unfinished','done')),
 completed_at timestamptz,
 needs_handover boolean NOT NULL DEFAULT false,
 email_sent_at timestamptz,
 email_sent_by uuid REFERENCES auth.users(id),
 email_sent_to text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bz_work_tasks_branch_date_idx ON public.bz_work_tasks(branch,work_date);
CREATE INDEX IF NOT EXISTS bz_work_tasks_assignee_idx ON public.bz_work_tasks(assigned_uid,work_date);

CREATE TABLE IF NOT EXISTS public.bz_work_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES public.bz_work_tasks(id) ON DELETE CASCADE,
 author_uid uuid NOT NULL REFERENCES auth.users(id),
 author_name text,
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bz_work_notes_task_idx ON public.bz_work_notes(task_id,created_at);

CREATE TABLE IF NOT EXISTS public.bz_work_reasons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES public.bz_work_tasks(id) ON DELETE CASCADE,
 author_uid uuid NOT NULL REFERENCES auth.users(id),
 author_name text,
 kind text NOT NULL CHECK (kind IN ('progress','done','unfinished','handover')),
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bz_work_reasons_task_idx ON public.bz_work_reasons(task_id,created_at);

CREATE TABLE IF NOT EXISTS public.bz_work_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id uuid NOT NULL REFERENCES public.bz_work_tasks(id) ON DELETE CASCADE,
 actor_uid uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bz_work_events_task_idx ON public.bz_work_events(task_id,created_at);

CREATE TABLE IF NOT EXISTS public.bz_work_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES public.bz_work_tasks(id) ON DELETE RESTRICT,
 from_uid uuid NOT NULL REFERENCES auth.users(id),
 to_uid uuid NOT NULL REFERENCES public.bz_work_people(user_id),
 note text NOT NULL,
 handed_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_at timestamptz,
 acknowledged_by uuid REFERENCES auth.users(id),
 ack_name text,
 ack_note text,
 CHECK (from_uid <> to_uid)
);
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS class_id text;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS is_teacher_off boolean NOT NULL DEFAULT false;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS substitute_teacher_id text;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS schedule_change_id text;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS custom_values jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS ack text;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS ack_name text;
ALTER TABLE public.bz_work_tasks ADD COLUMN IF NOT EXISTS ack_note text;
ALTER TABLE public.bz_work_tasks DROP CONSTRAINT IF EXISTS bz_work_tasks_email_sent_to_fkey;
ALTER TABLE public.bz_work_tasks ALTER COLUMN email_sent_to TYPE text USING email_sent_to::text;
ALTER TABLE public.bz_work_handoffs ADD COLUMN IF NOT EXISTS ack_name text;
ALTER TABLE public.bz_work_handoffs ADD COLUMN IF NOT EXISTS ack_note text;
ALTER TABLE public.bz_work_notes ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.bz_work_reasons ADD COLUMN IF NOT EXISTS author_name text;
CREATE UNIQUE INDEX IF NOT EXISTS bz_work_one_pending_handoff ON public.bz_work_handoffs(task_id) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS bz_work_handoffs_to_idx ON public.bz_work_handoffs(to_uid,acknowledged_at);

-- RLS on every module table. Browser clients can SELECT according to branch/assignee;
-- writes are ONLY through RPCs that validate role using auth.uid(), log changes atomically.
ALTER TABLE public.bz_work_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bz_work_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bz_work_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bz_work_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bz_work_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bz_work_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bz_work_people, public.bz_work_tasks, public.bz_work_notes,
 public.bz_work_reasons, public.bz_work_events, public.bz_work_handoffs FROM anon, authenticated;
GRANT SELECT ON TABLE public.bz_work_people, public.bz_work_tasks, public.bz_work_notes,
 public.bz_work_reasons, public.bz_work_events, public.bz_work_handoffs TO authenticated;

-- Fixed search_path; functions owned by privileged migration owner, never editable by clients.
CREATE OR REPLACE FUNCTION public.bz_work_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$SELECT p.role FROM public.bz_work_people p WHERE p.user_id = (SELECT auth.uid()) AND p.active = true LIMIT 1$$;
REVOKE ALL ON FUNCTION public.bz_work_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.bz_work_is_pending_recipient(p_task_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.bz_work_handoffs h WHERE h.task_id=p_task_id AND h.to_uid=(SELECT auth.uid()) AND h.acknowledged_at IS NULL) $$;
REVOKE ALL ON FUNCTION public.bz_work_is_pending_recipient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_is_pending_recipient(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bz_work_can_read(p_task_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.bz_work_tasks t WHERE t.id = p_task_id AND
   CASE WHEN public.bz_work_role() IN ('manager','admin') THEN true
        WHEN public.bz_work_role()='trainer' THEN t.branch='training'
        WHEN public.bz_work_role()='teacher' THEN t.branch='training' AND (t.assigned_uid=(SELECT auth.uid()) OR public.bz_work_is_pending_recipient(t.id))
        ELSE false END
 )
$$;
REVOKE ALL ON FUNCTION public.bz_work_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_can_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bz_work_can_manage(p_branch text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT coalesce((public.bz_work_role() IN ('manager','admin') OR (public.bz_work_role()='trainer' AND p_branch='training')),false) $$;
REVOKE ALL ON FUNCTION public.bz_work_can_manage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_can_manage(text) TO authenticated;

DROP POLICY IF EXISTS bz_work_people_read ON public.bz_work_people;
CREATE POLICY bz_work_people_read ON public.bz_work_people FOR SELECT TO authenticated USING (
 user_id=(SELECT auth.uid()) OR public.bz_work_role() IN ('manager','admin')
 OR (public.bz_work_role()='trainer' AND role IN ('trainer','teacher'))
);
DROP POLICY IF EXISTS bz_work_tasks_read ON public.bz_work_tasks;
CREATE POLICY bz_work_tasks_read ON public.bz_work_tasks FOR SELECT TO authenticated USING (
 public.bz_work_role() IN ('manager','admin')
 OR (public.bz_work_role()='trainer' AND branch='training')
 OR (public.bz_work_role()='teacher' AND branch='training' AND (assigned_uid=(SELECT auth.uid()) OR public.bz_work_is_pending_recipient(id)))
);
DROP POLICY IF EXISTS bz_work_notes_read ON public.bz_work_notes;
CREATE POLICY bz_work_notes_read ON public.bz_work_notes FOR SELECT TO authenticated USING (public.bz_work_can_read(task_id));
DROP POLICY IF EXISTS bz_work_reasons_read ON public.bz_work_reasons;
CREATE POLICY bz_work_reasons_read ON public.bz_work_reasons FOR SELECT TO authenticated USING (public.bz_work_can_read(task_id));
DROP POLICY IF EXISTS bz_work_events_read ON public.bz_work_events;
CREATE POLICY bz_work_events_read ON public.bz_work_events FOR SELECT TO authenticated USING (public.bz_work_can_read(task_id));
DROP POLICY IF EXISTS bz_work_handoffs_read ON public.bz_work_handoffs;
CREATE POLICY bz_work_handoffs_read ON public.bz_work_handoffs FOR SELECT TO authenticated USING (public.bz_work_can_read(task_id));

CREATE OR REPLACE FUNCTION public.bz_work_create_task(
 p_branch text, p_title text, p_description text, p_assigned_uid uuid,
 p_work_date date, p_shift_label text, p_class_label text, p_priority text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_task uuid; v_role text; v_target text;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.bz_work_can_manage(p_branch) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_branch NOT IN ('admin','training') OR p_priority NOT IN ('normal','high') OR length(btrim(p_title)) NOT BETWEEN 1 AND 220 THEN RAISE EXCEPTION 'Invalid task fields'; END IF;
 SELECT role INTO v_target FROM public.bz_work_people WHERE user_id = p_assigned_uid AND active;
 IF v_target IS NULL OR (p_branch='admin' AND v_target NOT IN ('manager','admin')) OR (p_branch='training' AND v_target NOT IN ('manager','admin','trainer','teacher')) THEN RAISE EXCEPTION 'Invalid assignee for branch'; END IF;
 INSERT INTO public.bz_work_tasks(branch,title,description,assigned_uid,created_by,work_date,shift_label,class_label,priority)
 VALUES (p_branch,btrim(p_title),left(coalesce(p_description,''),10000),p_assigned_uid,auth.uid(),p_work_date,coalesce(nullif(p_shift_label,''),'Ca chiều'),coalesce(p_class_label,''),p_priority) RETURNING id INTO v_task;
 INSERT INTO public.bz_work_events(task_id,actor_uid,action) VALUES(v_task,auth.uid(),'created');
 RETURN v_task;
END $$;

CREATE OR REPLACE FUNCTION public.bz_work_edit_task(
 p_task_id uuid, p_title text, p_description text, p_assigned_uid uuid,
 p_work_date date, p_shift_label text, p_class_label text, p_priority text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch text; v_old_assignee uuid; v_target text;
BEGIN
 SELECT branch,assigned_uid INTO v_branch,v_old_assignee FROM public.bz_work_tasks WHERE id=p_task_id FOR UPDATE;
 IF v_branch IS NULL OR NOT coalesce(public.bz_work_can_manage(v_branch),false) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_priority NOT IN ('normal','high') OR length(btrim(p_title)) NOT BETWEEN 1 AND 220 THEN RAISE EXCEPTION 'Invalid task fields'; END IF;
 SELECT role INTO v_target FROM public.bz_work_people WHERE user_id=p_assigned_uid AND active;
 IF v_target IS NULL OR (v_branch='admin' AND v_target NOT IN ('manager','admin')) OR (v_branch='training' AND v_target NOT IN ('manager','admin','trainer','teacher')) THEN RAISE EXCEPTION 'Invalid assignee'; END IF;
 UPDATE public.bz_work_tasks SET title=btrim(p_title),description=left(coalesce(p_description,''),10000),assigned_uid=p_assigned_uid,
 work_date=p_work_date,shift_label=coalesce(nullif(p_shift_label,''),'Ca chiều'),class_label=coalesce(p_class_label,''),priority=p_priority,
 email_sent_at=CASE WHEN v_old_assignee<>p_assigned_uid THEN NULL ELSE email_sent_at END,
 email_sent_by=CASE WHEN v_old_assignee<>p_assigned_uid THEN NULL ELSE email_sent_by END,
 email_sent_to=CASE WHEN v_old_assignee<>p_assigned_uid THEN NULL ELSE email_sent_to END,
 updated_at=now() WHERE id=p_task_id;
 INSERT INTO public.bz_work_events(task_id,actor_uid,action,payload) VALUES(p_task_id,auth.uid(),'edited',jsonb_build_object('assignee_changed',v_old_assignee<>p_assigned_uid));
END $$;

CREATE OR REPLACE FUNCTION public.bz_work_update_status(p_task_id uuid,p_status text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch text; v_assignee uuid; v_previous text;
BEGIN
 SELECT branch,assigned_uid,status INTO v_branch,v_assignee,v_previous FROM public.bz_work_tasks WHERE id=p_task_id FOR UPDATE;
 IF v_branch IS NULL OR NOT coalesce((public.bz_work_can_manage(v_branch) OR (public.bz_work_role()='teacher' AND v_branch='training' AND v_assignee=auth.uid())),false) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_status NOT IN ('todo','progress','unfinished','done') OR (p_status<>'todo' AND length(btrim(coalesce(p_reason,'')))<2) THEN RAISE EXCEPTION 'Reason required'; END IF;
 IF p_status='done' AND EXISTS (SELECT 1 FROM public.bz_work_handoffs WHERE task_id=p_task_id AND acknowledged_at IS NULL) THEN RAISE EXCEPTION 'Confirm handoff before completing task'; END IF;
 UPDATE public.bz_work_tasks SET status=p_status,completed_at=CASE WHEN p_status='done' THEN coalesce(completed_at,now()) ELSE NULL END,
 needs_handover=CASE WHEN p_status='done' THEN false ELSE needs_handover END,updated_at=now() WHERE id=p_task_id;
 IF length(btrim(coalesce(p_reason,'')))>0 THEN
  INSERT INTO public.bz_work_reasons(task_id,author_uid,kind,body) VALUES(p_task_id,auth.uid(),CASE WHEN p_status='todo' THEN 'progress' ELSE p_status END,p_reason);
 END IF;
 INSERT INTO public.bz_work_events(task_id,actor_uid,action,payload) VALUES(p_task_id,auth.uid(),'status_changed',jsonb_build_object('before',v_previous,'after',p_status));
END $$;

CREATE OR REPLACE FUNCTION public.bz_work_add_note(p_task_id uuid,p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT coalesce(public.bz_work_can_read(p_task_id),false) OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Not authorized or invalid note'; END IF;
 INSERT INTO public.bz_work_notes(task_id,author_uid,body) VALUES(p_task_id,auth.uid(),btrim(p_body));
 INSERT INTO public.bz_work_events(task_id,actor_uid,action) VALUES(p_task_id,auth.uid(),'note_added');
END $$;

CREATE OR REPLACE FUNCTION public.bz_work_add_reason(p_task_id uuid,p_kind text,p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch text; v_assignee uuid;
BEGIN
 SELECT branch,assigned_uid INTO v_branch,v_assignee FROM public.bz_work_tasks WHERE id=p_task_id;
 IF v_branch IS NULL OR NOT coalesce((public.bz_work_can_manage(v_branch) OR (public.bz_work_role()='teacher' AND v_branch='training' AND v_assignee=auth.uid())),false) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_kind NOT IN ('progress','done','unfinished','handover') OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Invalid reason'; END IF;
 IF p_kind='handover' AND NOT public.bz_work_can_manage(v_branch) THEN RAISE EXCEPTION 'Only a manager can hand over'; END IF;
 INSERT INTO public.bz_work_reasons(task_id,author_uid,kind,body) VALUES(p_task_id,auth.uid(),p_kind,btrim(p_body));
 INSERT INTO public.bz_work_events(task_id,actor_uid,action,payload) VALUES(p_task_id,auth.uid(),'reason_added',jsonb_build_object('kind',p_kind));
END $$;

CREATE OR REPLACE FUNCTION public.bz_work_handoff(p_task_id uuid,p_to_uid uuid,p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch text; v_target text; v_id uuid;
BEGIN
 SELECT branch INTO v_branch FROM public.bz_work_tasks WHERE id=p_task_id FOR UPDATE;
 IF v_branch IS NULL OR NOT coalesce(public.bz_work_can_manage(v_branch),false) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF auth.uid()=p_to_uid OR length(btrim(coalesce(p_note,'')))<2 THEN RAISE EXCEPTION 'A recipient and note are required'; END IF;
 SELECT role INTO v_target FROM public.bz_work_people WHERE user_id=p_to_uid AND active;
 IF v_target IS NULL OR (v_branch='admin' AND v_target NOT IN ('manager','admin')) OR (v_branch='training' AND v_target NOT IN ('manager','admin','trainer','teacher')) THEN RAISE EXCEPTION 'Recipient not allowed'; END IF;
 IF (SELECT status FROM public.bz_work_tasks WHERE id=p_task_id)='done' THEN RAISE EXCEPTION 'Finished tasks cannot be handed off'; END IF;
 INSERT INTO public.bz_work_handoffs(task_id,from_uid,to_uid,note) VALUES(p_task_id,auth.uid(),p_to_uid,btrim(p_note)) RETURNING id INTO v_id;
 UPDATE public.bz_work_tasks SET needs_handover=true,updated_at=now() WHERE id=p_task_id;
 INSERT INTO public.bz_work_reasons(task_id,author_uid,kind,body) VALUES(p_task_id,auth.uid(),'handover',btrim(p_note));
 INSERT INTO public.bz_work_events(task_id,actor_uid,action,payload) VALUES(p_task_id,auth.uid(),'handed_off',jsonb_build_object('to_uid',p_to_uid));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.bz_work_ack_handoff(p_handoff_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_task uuid; v_to uuid;
BEGIN
 SELECT task_id,to_uid INTO v_task,v_to FROM public.bz_work_handoffs WHERE id=p_handoff_id AND acknowledged_at IS NULL FOR UPDATE;
 IF v_task IS NULL OR v_to<>(SELECT auth.uid()) THEN RAISE EXCEPTION 'Only named recipient can acknowledge'; END IF;
 UPDATE public.bz_work_handoffs SET acknowledged_at=now(),acknowledged_by=auth.uid() WHERE id=p_handoff_id;
 UPDATE public.bz_work_tasks SET assigned_uid=v_to,needs_handover=false,email_sent_at=null,email_sent_by=null,email_sent_to=null,updated_at=now() WHERE id=v_task;
 INSERT INTO public.bz_work_events(task_id,actor_uid,action) VALUES(v_task,auth.uid(),'handoff_acknowledged');
END $$;

-- Manual flag only; opening Gmail does not prove the email was sent.
CREATE OR REPLACE FUNCTION public.bz_work_mark_email(p_task_id uuid,p_sent boolean,p_to_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch text; v_target text;
BEGIN
 SELECT branch INTO v_branch FROM public.bz_work_tasks WHERE id=p_task_id FOR UPDATE;
 IF v_branch IS NULL OR NOT coalesce(public.bz_work_can_manage(v_branch),false) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_sent THEN
   SELECT role INTO v_target FROM public.bz_work_people WHERE user_id=p_to_uid AND active;
   IF v_target IS NULL OR (v_branch='admin' AND v_target NOT IN ('manager','admin')) OR (v_branch='training' AND v_target NOT IN ('manager','admin','trainer','teacher')) THEN RAISE EXCEPTION 'Invalid email recipient'; END IF;
 END IF;
 UPDATE public.bz_work_tasks SET email_sent_at=CASE WHEN p_sent THEN now() ELSE NULL END,
 email_sent_by=CASE WHEN p_sent THEN auth.uid() ELSE NULL END,
 email_sent_to=CASE WHEN p_sent THEN (SELECT email FROM public.bz_work_people WHERE user_id=p_to_uid) ELSE NULL END,updated_at=now() WHERE id=p_task_id;
 INSERT INTO public.bz_work_events(task_id,actor_uid,action,payload) VALUES(p_task_id,auth.uid(),CASE WHEN p_sent THEN 'email_marked_sent' ELSE 'email_marked_unsent' END,jsonb_build_object('to_uid',p_to_uid,'manual_confirmation',true));
END $$;

-- Project active BeeZone accounts into the task directory. Roles are derived only
-- from the protected profiles table; clients cannot self-assign a work role.
CREATE OR REPLACE FUNCTION public.bz_work_sync_people()
RETURNS TABLE(user_id uuid, display_name text, email text, role text, active boolean, department text, branch text, teacher_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=true) THEN
   RAISE EXCEPTION 'Active BeeZone account required';
 END IF;
 INSERT INTO public.bz_work_people(user_id,display_name,email,role,active)
 SELECT p.id,coalesce(nullif(btrim(p.full_name),''),p.email),p.email,
   CASE WHEN p.role='owner' THEN 'manager'
        WHEN nullif(p.permissions->>'teacherId','') IS NOT NULL OR (jsonb_typeof(p.permissions->'assignedClassIds')='array' AND jsonb_array_length(p.permissions->'assignedClassIds')>0) THEN 'teacher'
        WHEN coalesce(p.permissions->'academic'->'programs','false'::jsonb)='true'::jsonb
          OR coalesce(p.permissions->'academic'->'classes','false'::jsonb)='true'::jsonb THEN 'trainer'
        ELSE 'admin' END, true
 FROM public.profiles p
 WHERE p.is_active=true AND (coalesce(p.is_private,false)=false OR p.id=auth.uid())
 ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,email=excluded.email,role=excluded.role,active=true;
 UPDATE public.bz_work_people w SET active=false
 WHERE w.active=true AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=w.user_id AND (p.is_active=false OR (p.is_private=true AND p.id<>auth.uid())));
 RETURN QUERY SELECT w.user_id,w.display_name,w.email,w.role,w.active,
   CASE WHEN w.role='manager' THEN 'Chủ trung tâm' WHEN w.role='trainer' THEN 'Đào tạo' WHEN w.role='teacher' THEN 'Giáo viên' ELSE 'Hành chính' END,
   CASE WHEN w.role IN ('trainer','teacher') THEN 'training' ELSE 'admin' END,
   (p.permissions->>'teacherId')
 FROM public.bz_work_people w JOIN public.profiles p ON p.id=w.user_id
 WHERE w.active=true AND (w.user_id=auth.uid() OR public.bz_work_role()='manager'
   OR (public.bz_work_role()='admin' AND w.role IN ('manager','admin'))
   OR (public.bz_work_role()='trainer' AND w.role IN ('trainer','teacher')));
END $$;
REVOKE ALL ON FUNCTION public.bz_work_sync_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_sync_people() TO authenticated;

-- One atomic sync request for the module. New rows are authored by auth.uid();
-- edits compare the device's expected updated_at, so stale clients get a conflict
-- instead of silently replacing newer work from another device.
CREATE OR REPLACE FUNCTION public.bz_work_sync_snapshot(
 p_tasks jsonb, p_expected_tasks jsonb, p_notes jsonb, p_reasons jsonb, p_handoffs jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb; v_id uuid; v_expected timestamptz; v_actual timestamptz; v_branch text; v_assignee uuid; v_target text;
BEGIN
 IF auth.uid() IS NULL OR public.bz_work_role() IS NULL THEN RAISE EXCEPTION 'Active work account required'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_tasks,'[]'::jsonb)) LOOP
   IF coalesce(r->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN CONTINUE; END IF;
   v_id := (r->>'id')::uuid; v_branch := r->>'branch'; v_assignee := nullif(r->>'assigned_uid','')::uuid;
   IF v_branch NOT IN ('admin','training') OR NOT (public.bz_work_can_manage(v_branch)
      OR (public.bz_work_role()='teacher' AND v_branch='training' AND v_assignee=auth.uid())) THEN CONTINUE; END IF;
   SELECT role INTO v_target FROM public.bz_work_people WHERE user_id=v_assignee AND active=true;
   IF v_target IS NULL OR (v_branch='admin' AND v_target NOT IN ('manager','admin')) THEN RAISE EXCEPTION 'Invalid work assignee'; END IF;
   SELECT updated_at INTO v_actual FROM public.bz_work_tasks WHERE id=v_id FOR UPDATE;
   IF FOUND THEN
     SELECT nullif(x.value->>'updated_at','')::timestamptz INTO v_expected FROM jsonb_array_elements(coalesce(p_expected_tasks,'[]'::jsonb)) AS x(value) WHERE x.value->>'id'=v_id::text LIMIT 1;
     IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_actual THEN RAISE EXCEPTION 'Work item changed on another device; refresh and retry' USING ERRCODE='40001'; END IF;
     IF nullif(r->>'updated_at','')::timestamptz IS DISTINCT FROM v_expected THEN
       IF coalesce(r->>'status','todo')='done' AND EXISTS (SELECT 1 FROM public.bz_work_handoffs h WHERE h.task_id=v_id AND h.acknowledged_at IS NULL) THEN RAISE EXCEPTION 'Confirm handoff before completing task'; END IF;
       IF public.bz_work_role()='teacher' THEN
         IF v_assignee<>auth.uid() OR EXISTS (SELECT 1 FROM public.bz_work_tasks t WHERE t.id=v_id AND
           (t.title IS DISTINCT FROM (r->>'title') OR t.description IS DISTINCT FROM coalesce(r->>'description','') OR t.work_date IS DISTINCT FROM (r->>'work_date')::date
             OR t.shift_label IS DISTINCT FROM coalesce(nullif(r->>'shift_label',''),'Ca chiều') OR t.class_label IS DISTINCT FROM coalesce(r->>'class_label','')
             OR t.class_id IS DISTINCT FROM nullif(r->>'classId','') OR t.is_teacher_off IS DISTINCT FROM coalesce((r->>'is_teacher_off')::boolean,false)
             OR t.substitute_teacher_id IS DISTINCT FROM nullif(r->>'substitute_teacher_id','') OR t.schedule_change_id IS DISTINCT FROM nullif(r->>'schedule_change_id','')
             OR t.custom_values IS DISTINCT FROM coalesce(r->'values','{}'::jsonb) OR t.priority IS DISTINCT FROM coalesce(r->>'priority','normal')
             OR t.email_sent_at IS DISTINCT FROM nullif(r->>'email_sent_at','')::timestamptz OR t.email_sent_to IS DISTINCT FROM nullif(r->>'email_sent_to','')
             OR t.ack IS DISTINCT FROM nullif(r->>'ack','') OR t.ack_name IS DISTINCT FROM nullif(r->>'ack_name','') OR t.ack_note IS DISTINCT FROM nullif(r->>'ack_note','')
             OR (t.assigned_uid<>auth.uid() AND NOT EXISTS (SELECT 1 FROM public.bz_work_handoffs h WHERE h.task_id=t.id AND h.to_uid=auth.uid() AND h.acknowledged_at IS NULL))))
         THEN RAISE EXCEPTION 'Teachers can only update status of their assigned work'; END IF;
         UPDATE public.bz_work_tasks SET status=coalesce(r->>'status','todo'),completed_at=nullif(r->>'completed_at','')::timestamptz,
           needs_handover=coalesce((r->>'needs_handover')::boolean,false),updated_at=nullif(r->>'updated_at','')::timestamptz
         WHERE id=v_id AND updated_at=v_expected;
       ELSE
       UPDATE public.bz_work_tasks SET title=left(btrim(r->>'title'),220),description=left(coalesce(r->>'description',''),10000),assigned_uid=v_assignee,
         work_date=(r->>'work_date')::date,shift_label=coalesce(nullif(r->>'shift_label',''),'Ca chiều'),class_label=coalesce(r->>'class_label',''),
         class_id=nullif(r->>'classId',''),is_teacher_off=coalesce((r->>'is_teacher_off')::boolean,false),
         substitute_teacher_id=nullif(r->>'substitute_teacher_id',''),schedule_change_id=nullif(r->>'schedule_change_id',''),
         custom_values=coalesce(r->'values','{}'::jsonb),priority=coalesce(r->>'priority','normal'),status=coalesce(r->>'status','todo'),
         completed_at=nullif(r->>'completed_at','')::timestamptz,needs_handover=coalesce((r->>'needs_handover')::boolean,false),
         email_sent_at=nullif(r->>'email_sent_at','')::timestamptz,email_sent_to=nullif(r->>'email_sent_to',''),ack=nullif(r->>'ack',''),ack_name=nullif(r->>'ack_name',''),ack_note=nullif(r->>'ack_note',''),
         updated_at=nullif(r->>'updated_at','')::timestamptz WHERE id=v_id AND updated_at=v_expected;
       END IF;
       IF NOT FOUND THEN RAISE EXCEPTION 'Work item changed on another device; refresh and retry' USING ERRCODE='40001'; END IF;
     END IF;
   ELSE
     IF NOT public.bz_work_can_manage(v_branch) THEN RAISE EXCEPTION 'Only a task manager can create shared work'; END IF;
     IF length(btrim(coalesce(r->>'title',''))) NOT BETWEEN 1 AND 220 THEN RAISE EXCEPTION 'Invalid task title'; END IF;
     INSERT INTO public.bz_work_tasks(id,branch,title,description,assigned_uid,created_by,work_date,shift_label,class_label,class_id,is_teacher_off,substitute_teacher_id,schedule_change_id,custom_values,priority,status,completed_at,needs_handover,email_sent_at,email_sent_to,ack,ack_name,ack_note,created_at,updated_at)
     VALUES(v_id,v_branch,left(btrim(r->>'title'),220),left(coalesce(r->>'description',''),10000),v_assignee,auth.uid(),(r->>'work_date')::date,
       coalesce(nullif(r->>'shift_label',''),'Ca chiều'),coalesce(r->>'class_label',''),nullif(r->>'classId',''),coalesce((r->>'is_teacher_off')::boolean,false),
       nullif(r->>'substitute_teacher_id',''),nullif(r->>'schedule_change_id',''),coalesce(r->'values','{}'::jsonb),coalesce(r->>'priority','normal'),
       coalesce(r->>'status','todo'),nullif(r->>'completed_at','')::timestamptz,coalesce((r->>'needs_handover')::boolean,false),
       nullif(r->>'email_sent_at','')::timestamptz,nullif(r->>'email_sent_to',''),nullif(r->>'ack',''),nullif(r->>'ack_name',''),nullif(r->>'ack_note',''),now(),coalesce(nullif(r->>'updated_at','')::timestamptz,now()));
     INSERT INTO public.bz_work_events(task_id,actor_uid,action) VALUES(v_id,auth.uid(),'created');
   END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_notes,'[]'::jsonb)) LOOP
   IF coalesce(r->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND coalesce(r->>'author_uid','')=auth.uid()::text AND public.bz_work_can_read((r->>'task_id')::uuid) THEN
     INSERT INTO public.bz_work_notes(id,task_id,author_uid,author_name,body,created_at) VALUES((r->>'id')::uuid,(r->>'task_id')::uuid,auth.uid(),nullif(left(r->>'author_name',150),''),left(btrim(r->>'body'),3000),coalesce(nullif(r->>'created_at','')::timestamptz,now())) ON CONFLICT(id) DO NOTHING;
   END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_reasons,'[]'::jsonb)) LOOP
   IF coalesce(r->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND coalesce(r->>'author_uid','')=auth.uid()::text AND public.bz_work_can_read((r->>'task_id')::uuid) THEN
     INSERT INTO public.bz_work_reasons(id,task_id,author_uid,author_name,kind,body,created_at) VALUES((r->>'id')::uuid,(r->>'task_id')::uuid,auth.uid(),nullif(left(r->>'author_name',150),''),r->>'kind',left(btrim(r->>'body'),3000),coalesce(nullif(r->>'created_at','')::timestamptz,now())) ON CONFLICT(id) DO NOTHING;
   END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_handoffs,'[]'::jsonb)) LOOP
   IF coalesce(r->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
     v_id := (r->>'id')::uuid;
     IF NOT EXISTS (SELECT 1 FROM public.bz_work_handoffs WHERE id=v_id) AND coalesce(r->>'from_uid','')=auth.uid()::text
        AND public.bz_work_can_manage((SELECT branch FROM public.bz_work_tasks WHERE id=(r->>'task_id')::uuid)) THEN
       IF nullif(r->>'to_uid','')::uuid=auth.uid() OR length(btrim(coalesce(r->>'note','')))<2 THEN RAISE EXCEPTION 'A recipient and handoff note are required'; END IF;
       SELECT role INTO v_target FROM public.bz_work_people WHERE user_id=(r->>'to_uid')::uuid AND active=true;
       SELECT branch INTO v_branch FROM public.bz_work_tasks WHERE id=(r->>'task_id')::uuid;
       IF v_target IS NULL OR (v_branch='admin' AND v_target NOT IN ('manager','admin')) THEN RAISE EXCEPTION 'Invalid handoff recipient'; END IF;
       INSERT INTO public.bz_work_handoffs(id,task_id,from_uid,to_uid,note,handed_at) VALUES(v_id,(r->>'task_id')::uuid,auth.uid(),(r->>'to_uid')::uuid,left(coalesce(r->>'note',''),3000),coalesce(nullif(r->>'handed_at','')::timestamptz,now()));
     ELSE
       UPDATE public.bz_work_handoffs SET acknowledged_at=nullif(r->>'acknowledged_at','')::timestamptz,acknowledged_by=auth.uid(),ack_name=nullif(r->>'ack_name',''),ack_note=nullif(r->>'ack_note','')
       WHERE id=v_id AND to_uid=auth.uid() AND acknowledged_at IS NULL AND nullif(r->>'acknowledged_at','') IS NOT NULL;
       IF FOUND THEN UPDATE public.bz_work_tasks SET assigned_uid=auth.uid(),needs_handover=false,email_sent_at=null,email_sent_by=null,email_sent_to=null,ack=coalesce(r->>'ack_name','Đã nhận bàn giao'),ack_name=nullif(r->>'ack_name',''),ack_note=nullif(r->>'ack_note',''),updated_at=coalesce(nullif(r->>'updated_at','')::timestamptz,now()) WHERE id=(r->>'task_id')::uuid; END IF;
     END IF;
   END IF;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.bz_work_sync_snapshot(jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_sync_snapshot(jsonb,jsonb,jsonb,jsonb,jsonb) TO authenticated;

-- Supabase default execute privileges on newly created routines may include PUBLIC. Restrict explicitly.
REVOKE ALL ON FUNCTION public.bz_work_create_task(text,text,text,uuid,date,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_edit_task(uuid,text,text,uuid,date,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_update_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_add_note(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_add_reason(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_handoff(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_ack_handoff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bz_work_mark_email(uuid,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_create_task(text,text,text,uuid,date,text,text,text),
 public.bz_work_edit_task(uuid,text,text,uuid,date,text,text,text),
 public.bz_work_update_status(uuid,text,text),
 public.bz_work_add_note(uuid,text), public.bz_work_add_reason(uuid,text,text),
 public.bz_work_handoff(uuid,uuid,text), public.bz_work_ack_handoff(uuid),
 public.bz_work_mark_email(uuid,boolean,uuid) TO authenticated;
DO $$
DECLARE v_table text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   FOREACH v_table IN ARRAY ARRAY['bz_work_tasks','bz_work_notes','bz_work_reasons','bz_work_handoffs'] LOOP
     IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table) THEN
       EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
     END IF;
   END LOOP;
 END IF;
END $$;
COMMIT;
