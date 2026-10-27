-- Migration 023: Support 3 distinct work branches: 'admin', 'training', 'teacher'
-- Phân định rạch ròi 3 nhóm công việc: Hành chính - Đào tạo - Giáo viên

-- 1. Update check constraint on bz_work_tasks
ALTER TABLE public.bz_work_tasks DROP CONSTRAINT IF EXISTS bz_work_tasks_branch_check;
ALTER TABLE public.bz_work_tasks ADD CONSTRAINT bz_work_tasks_branch_check CHECK (branch IN ('admin', 'training', 'teacher'));

-- 2. Update bz_work_can_manage function to allow trainers to manage both training and teacher tasks
CREATE OR REPLACE FUNCTION public.bz_work_can_manage(p_branch text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (public.bz_work_role() IN ('manager','admin')
     OR (public.bz_work_role()='trainer' AND p_branch IN ('training', 'teacher'))),
    false
  )
$$;

-- 3. Update RLS policies on bz_work_tasks
DROP POLICY IF EXISTS bz_work_tasks_select ON public.bz_work_tasks;
CREATE POLICY bz_work_tasks_select ON public.bz_work_tasks FOR SELECT TO authenticated USING (
  public.bz_work_role() IN ('manager','admin')
  OR (public.bz_work_role()='trainer' AND branch IN ('training', 'teacher'))
  OR (public.bz_work_role()='teacher' AND branch IN ('training', 'teacher') AND (assigned_uid=(SELECT auth.uid()) OR public.bz_work_is_pending_recipient(id)))
);

-- 4. Update bz_work_sync_people projection so teachers have branch = 'teacher'
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
         WHEN p.role='admin' THEN 'admin'
         WHEN p.role='trainer' THEN 'trainer'
         ELSE 'teacher' END, true
  FROM public.profiles p
  WHERE p.is_active=true AND (coalesce(p.is_private,false)=false OR p.id=auth.uid())
  ON CONFLICT ON CONSTRAINT bz_work_people_pkey DO UPDATE
    SET display_name=excluded.display_name,email=excluded.email,role=excluded.role,active=true;
  UPDATE public.bz_work_people w SET active=false
  WHERE w.active=true AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=w.user_id AND (p.is_active=false OR (p.is_private=true AND p.id<>auth.uid())));
  RETURN QUERY SELECT w.user_id,w.display_name,w.email,w.role,w.active,
    CASE WHEN w.role='manager' THEN 'Chủ trung tâm'
         WHEN w.role='trainer' THEN 'Đào tạo'
         WHEN w.role='teacher' THEN 'Giáo viên'
         ELSE 'Hành chính' END,
    CASE WHEN w.role='teacher' THEN 'teacher'
         WHEN w.role='trainer' THEN 'training'
         ELSE 'admin' END,
    (p.permissions->>'teacherId')
  FROM public.bz_work_people w JOIN public.profiles p ON p.id=w.user_id
  WHERE w.active=true AND (w.user_id=auth.uid() OR public.bz_work_role() IN ('manager','admin')
    OR (public.bz_work_role()='trainer' AND w.role IN ('trainer','teacher')));
END $$;

REVOKE ALL ON FUNCTION public.bz_work_sync_people() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_sync_people() TO authenticated;

NOTIFY pgrst, 'reload schema';
