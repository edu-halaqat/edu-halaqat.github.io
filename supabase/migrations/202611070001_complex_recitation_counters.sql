alter table public.complex_teacher_plan_permissions add column if not exists show_recitation_counters boolean not null default true;
CREATE OR REPLACE FUNCTION public.get_complex_teacher_plan_permission(p_complex_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_complex public.complexes%ROWTYPE;
        v_manage boolean;
        v_allowed boolean;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT private.active_user() THEN
  RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_complex FROM public.complexes c
  WHERE c.id=p_complex_id AND c.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'المجمع غير موجود أو غير نشط.'; END IF;
 IF NOT private.can_access(v_complex.org_id,v_complex.id,NULL,
   ARRAY['admin','manager','supervisor','teacher']::public.app_role[]) THEN
  RAISE EXCEPTION 'ليس لديك إذن للاطلاع على سياسة هذا المجمع.' USING ERRCODE='42501';
 END IF;
 v_manage:=private.can_access(v_complex.org_id,v_complex.id,NULL,
   ARRAY['admin','manager','supervisor']::public.app_role[]);
 SELECT coalesce((SELECT allow_teacher_edit
  FROM public.complex_teacher_plan_permissions
  WHERE complex_id=v_complex.id AND org_id=v_complex.org_id),true)
 INTO v_allowed;
 RETURN jsonb_build_object('complexId',v_complex.id,'complexName',v_complex.name,
  'allowTeacherEdit',v_allowed,'canManage',v_manage,'showCounters',coalesce((select show_recitation_counters from public.complex_teacher_plan_permissions where complex_id=v_complex.id),true));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_complex_recitation_counters(p_complex_id text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_complex public.complexes%ROWTYPE; v_before boolean;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT private.active_user() THEN
  RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING ERRCODE='42501';
 END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'حدد السماح أو المنع.'; END IF;
 SELECT * INTO v_complex FROM public.complexes c
  WHERE c.id=p_complex_id AND c.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'المجمع غير موجود أو غير نشط.'; END IF;
 IF NOT private.can_access(v_complex.org_id,v_complex.id,NULL,
   ARRAY['admin','manager','supervisor']::public.app_role[]) THEN
  RAISE EXCEPTION 'هذه الصلاحية لمشرف المجمع والإدارة فقط.' USING ERRCODE='42501';
 END IF;
 SELECT coalesce((SELECT show_recitation_counters
  FROM public.complex_teacher_plan_permissions
  WHERE complex_id=v_complex.id AND org_id=v_complex.org_id),true)
 INTO v_before;
 INSERT INTO public.complex_teacher_plan_permissions
  (complex_id,org_id,show_recitation_counters,updated_at,updated_by)
 VALUES(v_complex.id,v_complex.org_id,p_enabled,now(),(SELECT auth.uid()))
 ON CONFLICT (complex_id) DO UPDATE
 SET show_recitation_counters=EXCLUDED.show_recitation_counters,
  updated_at=now(),updated_by=(SELECT auth.uid());
 IF v_before IS DISTINCT FROM p_enabled THEN
  INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
  VALUES(v_complex.org_id,'complex.recitation_counters_changed',
   (SELECT auth.uid()),'complex_teacher_plan_permissions',v_complex.id,
   jsonb_build_object('previous',v_before,'enabled',p_enabled));
 END IF;
 RETURN jsonb_build_object('ok',true,'complexId',v_complex.id,'showCounters',p_enabled);
END;
$function$
;
revoke all on function public.set_complex_recitation_counters(text,boolean) from public,anon;
grant execute on function public.set_complex_recitation_counters(text,boolean) to authenticated;

