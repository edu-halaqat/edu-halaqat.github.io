-- Atomic plan succession and memorization-only skip.
-- Neither function deletes historical plan days or student results.
CREATE OR REPLACE FUNCTION public.revise_active_plan_guarded(
 p_plan_id text,p_start_date date,p_unit public.plan_unit,p_daily_amount integer,
 p_direction public.plan_direction,p_start_surah integer,p_start_ayah integer,
 p_end_date date DEFAULT NULL,p_excluded_weekdays smallint[] DEFAULT NULL,
 p_new_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '45s'
AS $fn$
DECLARE
 v_actor uuid := (select auth.uid());
 v_old public.plans%rowtype;
 v_new_id text := extensions.gen_random_uuid()::text;
 v_latest date;
 v_response jsonb;
 v_limit date := (now() at time zone 'Asia/Riyadh')::date;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
   RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING errcode='42501';
 END IF;
 SELECT * INTO v_old FROM public.plans WHERE id=p_plan_id;
 IF NOT FOUND OR v_old.status<>'active' OR v_old.type NOT IN ('memorization','review') THEN
   RAISE EXCEPTION 'اختر خطة حفظ أو مراجعة كبرى نشطة.' USING errcode='22023';
 END IF;
 IF NOT (private.can_access(v_old.org_id,v_old.complex_id,v_old.circle_id,
               array['admin','manager','supervisor']::public.app_role[])
     OR (v_old.teacher_id IS NOT NULL AND private.teacher_can_write(
       v_old.org_id,v_old.complex_id,v_old.circle_id,v_old.teacher_id))) THEN
   RAISE EXCEPTION 'لا تملك صلاحية تعديل هذه الخطة.' USING errcode='42501';
 END IF;
 IF p_start_date IS NULL OR p_start_date<v_limit THEN
   RAISE EXCEPTION 'ابدأ المسار الجديد من اليوم أو يوم قادم؛ لا تعدّل أيامًا سابقة.' USING errcode='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sanabil-student-plans:'||v_old.student_id,0));
 SELECT * INTO v_old FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF v_old.status<>'active' THEN
   RAISE EXCEPTION 'تغيرت حالة الخطة أثناء التعديل؛ أعد تحميل الخطط.' USING errcode='40001';
 END IF;
 SELECT max(d.date_key) INTO v_latest FROM public.plan_days d
 WHERE d.plan_id=v_old.id
   AND (d.rating IS NOT NULL OR coalesce(d.completed_amount,0)>0
        OR coalesce(d.carry_in,0)>0 OR coalesce(d.carry_out,0)>0
        OR d.status IS DISTINCT FROM 'planned');
 IF v_latest IS NOT NULL AND p_start_date<=v_latest THEN
   RAISE EXCEPTION 'يوجد إنجاز أو ترحيل لاحق؛ اجعل تاريخ بدء المسار بعد % دون تعديل تاريخ الطالب.',v_latest
    USING errcode='23514';
 END IF;
 -- Archive the old version and create a replacement in the same transaction:
 -- if plan generation or review synchronization fails, archiving rolls back.
 PERFORM public.remove_plan(v_old.id);
 IF v_old.type='memorization' THEN
   v_response:=public.save_memorization_plan_whole_ayah(
     v_new_id,v_old.student_id,v_old.teacher_id,v_old.program_id,
     p_unit,p_daily_amount,p_direction,p_start_surah,p_start_ayah,p_start_date,
     coalesce(p_excluded_weekdays,v_old.excluded_weekdays), 'active',false,
     v_old.methodology_code,v_old.methodology_level,v_old.methodology_profile,
     coalesce(v_old.methodology_meta,'{}'::jsonb)
   );
   PERFORM public.sync_student_review_plans(v_old.student_id);
 ELSE
   v_response:=public.save_plan_with_days(
     v_new_id,v_old.student_id,v_old.teacher_id,v_old.program_id,'review',
     p_unit,p_daily_amount,p_direction,p_start_surah,p_start_ayah,
     p_start_date,coalesce(p_end_date,v_old.end_date),
     coalesce(p_excluded_weekdays,v_old.excluded_weekdays),'active',false
   );
   PERFORM public.update_plan_details_guarded(v_new_id,
     coalesce(nullif(btrim(p_new_name),''),v_old.name),v_old.methodology_code,
     coalesce(v_old.methodology_meta,'{}'::jsonb));
 END IF;
 INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
 VALUES(v_old.org_id,'plan.versioned_successor',v_actor,'plans',v_new_id,
   jsonb_build_object('previousPlanId',v_old.id,'startDate',p_start_date,
     'preservedHistoricalDays',true));
 RETURN v_response || jsonb_build_object(
   'ok',true,'newPlanId',v_new_id,'previousPlanId',v_old.id,
   'preservedHistory',true,'versioned',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.revise_active_plan_guarded(
 text,date,public.plan_unit,integer,public.plan_direction,integer,integer,date,smallint[],text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revise_active_plan_guarded(
 text,date,public.plan_unit,integer,public.plan_direction,integer,integer,date,smallint[],text)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.skip_memorization_today_guarded(
 p_plan_id text,p_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '30s'
AS $fn$
DECLARE
 v_actor uuid := (select auth.uid());
 v_plan public.plans%rowtype;
 v_changed jsonb;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
   RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING errcode='42501';
 END IF;
 SELECT * INTO v_plan FROM public.plans WHERE id=p_plan_id;
 IF NOT FOUND OR v_plan.type<>'memorization' OR v_plan.status<>'active' THEN
   RAISE EXCEPTION 'ليس لهذا الطالب مقرر حفظ نشط يمكن استثناؤه.' USING errcode='22023';
 END IF;
 IF NOT (private.can_access(v_plan.org_id,v_plan.complex_id,v_plan.circle_id,
               array['admin','manager','supervisor']::public.app_role[])
     OR (v_plan.teacher_id IS NOT NULL AND private.teacher_can_write(
       v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.teacher_id))) THEN
   RAISE EXCEPTION 'لا تملك صلاحية استثناء الحفظ.' USING errcode='42501';
 END IF;
 IF p_date<(now() at time zone 'Asia/Riyadh')::date THEN
   RAISE EXCEPTION 'لا يُستثنى الحفظ تلقائيًا بأثر رجعي بعد نهاية اليوم.' USING errcode='23514';
 END IF;
 -- Reuses the existing audited exclusion, which refuses graded or later carried days.
 v_changed:=public.exclude_plan_date(p_plan_id,p_date);
 PERFORM private.sync_recent_review_for_student(v_plan.student_id);
 RETURN coalesce(v_changed,'{}'::jsonb) ||
   jsonb_build_object('ok',true,'memorizationOnly',true,'preservedReviews',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.skip_memorization_today_guarded(text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.skip_memorization_today_guarded(text,date) TO authenticated;