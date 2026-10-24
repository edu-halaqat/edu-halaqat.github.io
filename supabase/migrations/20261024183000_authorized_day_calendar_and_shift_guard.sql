-- Small, authorized monthly day classifications for supervisors; avoids exposing
-- the RLS-protected circle_day_types table to unscoped client SELECT.
CREATE OR REPLACE FUNCTION public.get_circle_day_types_range_guarded(
 p_circle_ids text[],p_from date,p_to date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '6s'
AS $fn$
DECLARE v_actor uuid:=(select auth.uid());v_count integer;v_c text;v_row record;v_result jsonb;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
   RAISE EXCEPTION 'يلزم تسجيل الدخول بحساب نشط.' USING errcode='42501';
 END IF;
 v_count:=cardinality(p_circle_ids);
 IF v_count IS NULL OR v_count<1 OR v_count>40 OR
    (select count(distinct z) from unnest(p_circle_ids) z where z IS NOT NULL)<>v_count
    OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to>p_from+62 THEN
   RAISE EXCEPTION 'حدّد من 1 إلى 40 حلقة وفترة لا تزيد على 63 يومًا.' USING errcode='22023';
 END IF;
 FOR v_c IN SELECT unnest(p_circle_ids) ORDER BY 1 LOOP
   SELECT * INTO v_row FROM public.circles WHERE id=v_c AND active;
   IF NOT FOUND OR NOT private.can_access(v_row.org_id,v_row.complex_id,v_c,
      array['admin','manager','supervisor']::public.app_role[]) THEN
     RAISE EXCEPTION 'لا تملك صلاحية قراءة تقويم إحدى الحلقات.' USING errcode='42501';
   END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'circleId',d.circle_id,'date',d.date_key,'type',d.day_type)
  ORDER BY d.circle_id,d.date_key),'[]'::jsonb)
 INTO v_result FROM public.circle_day_types d
 WHERE d.circle_id=ANY(p_circle_ids) AND d.date_key BETWEEN p_from AND p_to;
 RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_circle_day_types_range_guarded(text[],date,date)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_circle_day_types_range_guarded(text[],date,date)
TO authenticated;

-- Honor days already classified by the teacher/supervisor when moving
-- an ungraded lesson. Previously the next day could itself be a holiday.
DO $safe$
DECLARE v_def text;
DECLARE v_old text:='and not (v_candidate=any(v_excluded_dates))';
DECLARE v_new text:='and not (v_candidate=any(v_excluded_dates))'||chr(10)||
 '        and private.effective_day_type(v_plan.student_id,v_candidate)=''study''';
BEGIN
 SELECT pg_get_functiondef('public.exclude_plan_date(text,date)'::regprocedure) INTO v_def;
 IF v_def IS NULL OR position(v_old in v_def)=0 THEN
   RAISE EXCEPTION 'تعذر العثور على موضع استثناء التواريخ في دالة ترحيل الخطة.';
 END IF;
 IF position('private.effective_day_type(v_plan.student_id,v_candidate)' in v_def)=0 THEN
   EXECUTE replace(v_def,v_old,v_new);
 END IF;
END;
$safe$;