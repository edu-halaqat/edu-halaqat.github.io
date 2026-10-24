-- Scope only manager-accessible complexes and circles. No unrestricted table grants.
CREATE OR REPLACE FUNCTION public.get_calendar_management_scope_guarded()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '8s'
AS $body$
DECLARE v_actor uuid:=(select auth.uid());v_out jsonb;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
   RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING errcode='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',scope.complex_id,'name',scope.complex_name,'circles',scope.circles)
   ORDER BY scope.complex_name),'[]'::jsonb)
 INTO v_out
 FROM (
   SELECT cx.id complex_id,cx.name complex_name,
     jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name) circles
   FROM public.complexes cx
   JOIN public.circles c ON c.complex_id=cx.id AND c.org_id=cx.org_id AND c.active
   WHERE cx.active AND private.can_access(c.org_id,c.complex_id,c.id,
       array['admin','manager','supervisor']::public.app_role[])
   GROUP BY cx.id,cx.name
 ) scope;
 RETURN v_out;
END;$body$;
REVOKE ALL ON FUNCTION public.get_calendar_management_scope_guarded() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_management_scope_guarded() TO authenticated;

-- Each invocation moves one (at most two) students in one bounded
-- transaction, so a large circle does not exceed the request deadline.
-- Resuming is safe because the per-student override acts as the checkpoint.
-- The common circle date is finalized only after every student succeeds.
CREATE OR REPLACE FUNCTION public.apply_calendar_day_step_guarded(
 p_circle_id text,p_date date,p_day_type text,p_batch_size integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '12s'
AS $body$
DECLARE
 v_actor uuid:=(select auth.uid());
 v_circle public.circles%rowtype;
 v_student record;
 v_result jsonb;
 v_processed integer:=0;
 v_plans integer:=0;
 v_remaining integer;
 v_total integer;
 v_previous text;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
   RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING errcode='42501';
 END IF;
 IF p_date IS NULL OR p_day_type NOT IN ('holiday','test','unaccounted','study')
   OR p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 2 THEN
   RAISE EXCEPTION 'تصنيف اليوم أو حجم الدفعة غير صالح.' USING errcode='22023';
 END IF;
 SELECT * INTO v_circle FROM public.circles WHERE id=p_circle_id AND active;
 IF NOT FOUND OR NOT private.can_access(v_circle.org_id,v_circle.complex_id,v_circle.id,
   array['admin','manager','supervisor']::public.app_role[]) THEN
   RAISE EXCEPTION 'لا تملك صلاحية اعتماد يوم هذه الحلقة.' USING errcode='42501';
 END IF;
 -- Same lock as set_day_type_guarded, to serialize concurrent managers.
 PERFORM pg_advisory_xact_lock(hashtext(p_circle_id),p_date-date '2000-01-01');
 v_previous:=coalesce((SELECT dt.day_type FROM public.circle_day_types dt
   WHERE dt.circle_id=p_circle_id AND dt.date_key=p_date),'study');
 IF v_previous=p_day_type THEN
   RETURN jsonb_build_object('ok',true,'completed',true,'unchanged',true,
     'processed',0,'remaining',0,'total',0,'affectedPlans',0);
 END IF;
 IF v_previous<>'study' AND v_previous<>p_day_type THEN
   RAISE EXCEPTION 'لليوم تصنيف معتمد سابقًا؛ عدّله عبر معالجة مخصصة تحفظ ترحيل الخطط.' USING errcode='23514';
 END IF;
 -- Changing an already-excluded holiday back to a study day cannot
 -- restore old lesson positions automatically; preserve original guard.
 IF p_day_type='study' AND v_previous<>'study' THEN
   RAISE EXCEPTION 'إلغاء الإجازة بعد ترحيل المقررات يحتاج مراجعة الخطط أولًا.' USING errcode='23514';
 END IF;
 SELECT count(*) INTO v_total FROM public.students s
 WHERE s.circle_id=p_circle_id AND s.active;
 FOR v_student IN
   SELECT s.id FROM public.students s
   WHERE s.circle_id=p_circle_id AND s.active
     AND NOT EXISTS(SELECT 1 FROM public.student_day_types t
       WHERE t.student_id=s.id AND t.date_key=p_date AND t.day_type=p_day_type)
   ORDER BY s.id LIMIT p_batch_size
 LOOP
   v_result:=public.set_day_type_guarded(p_circle_id,p_date,p_day_type,v_student.id);
   v_processed:=v_processed+1;
   v_plans:=v_plans+coalesce((v_result->>'affectedPlans')::integer,0);
   IF EXISTS(SELECT 1 FROM public.plan_days d
     JOIN public.plans p ON p.id=d.plan_id AND p.status='active'
     WHERE d.student_id=v_student.id AND d.date_key=p_date AND d.status='planned') THEN
     RAISE EXCEPTION 'لا يزال مقرر على هذا اليوم بعد إعادة الجدولة؛ لم تُعتمد الدفعة.' USING errcode='23514';
   END IF;
 END LOOP;
 SELECT count(*) INTO v_remaining FROM public.students s
 WHERE s.circle_id=p_circle_id AND s.active
   AND NOT EXISTS(SELECT 1 FROM public.student_day_types t
     WHERE t.student_id=s.id AND t.date_key=p_date AND t.day_type=p_day_type);
 IF v_remaining=0 THEN
   -- Only now commit the circle-wide classification. This will find every
   -- student already classified and avoid recomputing their plan shifts.
   v_result:=public.set_day_type_guarded(p_circle_id,p_date,p_day_type,NULL);
   -- Now that the circle default is authoritative, student checkpoints are
   -- redundant and may be removed; separately classified exceptions differ.
   DELETE FROM public.student_day_types t
   WHERE t.circle_id=p_circle_id AND t.date_key=p_date AND t.day_type=p_day_type;
 END IF;
 RETURN jsonb_build_object('ok',true,'completed',v_remaining=0,
   'processed',v_processed,'remaining',v_remaining,
   'total',v_total,'affectedPlans',v_plans,'circleId',p_circle_id,'date',p_date);
END;$body$;
REVOKE ALL ON FUNCTION public.apply_calendar_day_step_guarded(text,date,text,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_calendar_day_step_guarded(text,date,text,integer)
 TO authenticated;