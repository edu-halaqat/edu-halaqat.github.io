-- Service-role-only routine; validates actor, complex, and policy.
CREATE OR REPLACE FUNCTION public.provision_complex_staff(p_actor uuid, p_user uuid, p_org text, p_complex text, p_name text, p_phone text, p_title text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_is_admin boolean; v_is_supervisor boolean; v_policy boolean;
BEGIN
 SELECT EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.memberships m ON m.user_id=p.id
   WHERE p.id=p_actor AND p.active AND m.active AND m.org_id=p_org AND m.role='admin'
 ) INTO v_is_admin;
 SELECT EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.memberships m ON m.user_id=p.id
   WHERE p.id=p_actor AND p.active AND m.active AND m.org_id=p_org
     AND m.role='supervisor' AND m.complex_id=p_complex AND m.circle_id IS NULL
 ) INTO v_is_supervisor;
 IF NOT (v_is_admin OR v_is_supervisor) THEN
  RAISE EXCEPTION 'لا تملك صلاحية إضافة إداريين لهذا المجمع.' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.complexes WHERE id=p_complex AND org_id=p_org AND active) THEN
  RAISE EXCEPTION 'المجمع غير نشط أو خارج نطاق المؤسسة.' USING ERRCODE='42501';
 END IF;
 SELECT coalesce((
   SELECT allow_supervisor_staff_creation FROM public.complex_staff_creation_policy
   WHERE complex_id=p_complex AND org_id=p_org
 ),true) INTO v_policy;
 IF v_is_supervisor AND NOT v_is_admin AND NOT v_policy THEN
  RAISE EXCEPTION 'عطّل مدير النظام إنشاء الإداريين لهذا المجمع.' USING ERRCODE='42501';
 END IF;
 IF nullif(btrim(p_name),'') IS NULL OR length(btrim(p_name))>150
  OR length(coalesce(p_title,''))>100 THEN
  RAISE EXCEPTION 'تحقق من الاسم والمسمى الوظيفي.';
 END IF;
 IF p_user IS NULL OR p_user=p_actor
    OR EXISTS (SELECT 1 FROM public.memberships WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'هذه العملية مخصصة لحساب إداري جديد فقط.';
 END IF;
 PERFORM 1 FROM public.profiles
  WHERE id=p_user AND (org_id IS NULL OR org_id=p_org) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ملف الحساب الجديد غير متاح أو مسند لمؤسسة أخرى.'; END IF;
 UPDATE public.profiles
  SET org_id=p_org, active=true, display_name=btrim(p_name),
   phone=nullif(btrim(coalesce(p_phone,'')),''),
   role='staff'
  WHERE id=p_user;
 INSERT INTO public.memberships(user_id,role,org_id,complex_id,circle_id,active)
 VALUES(p_user,'staff',p_org,p_complex,NULL,true);
 INSERT INTO public.complex_staff_directory(user_id,org_id,complex_id,job_title,created_by)
 VALUES(p_user,p_org,p_complex,coalesce(nullif(btrim(coalesce(p_title,'')),''),'إداري مجمع'),p_actor);
 INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
 VALUES(p_org,'staff.created_by_complex_supervisor',p_actor,'profiles',p_user::text,
  jsonb_build_object('complexId',p_complex,'jobTitle',coalesce(nullif(btrim(coalesce(p_title,'')),''),'إداري مجمع')));
 RETURN jsonb_build_object('ok',true,'user_id',p_user,'complex_id',p_complex,'role','staff');
END;
$function$

REVOKE ALL ON FUNCTION public.provision_complex_staff(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_complex_staff(uuid,uuid,text,text,text,text,text) TO service_role;
