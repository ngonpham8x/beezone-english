-- Keep the task assignee directory consistent with bz_work_people_read RLS:
-- managers and administrators can see the full active directory, while trainers
-- see only training staff and teachers see only themselves.
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
 WHERE w.active=true AND (w.user_id=auth.uid() OR public.bz_work_role() IN ('manager','admin')
   OR (public.bz_work_role()='trainer' AND w.role IN ('trainer','teacher')));
END $$;

REVOKE ALL ON FUNCTION public.bz_work_sync_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bz_work_sync_people() TO authenticated;
