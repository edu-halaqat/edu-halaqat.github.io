-- Madinah school-year 1448-1449: verified holidays are defaults, not bulk
-- circle overrides. Supervisors can explicitly opt circles back into study.
-- School summer is deliberately absent. Future years are NOT activated.
CREATE TABLE IF NOT EXISTS private.academic_calendar_default_days (
 date_key date PRIMARY KEY,
 day_type text NOT NULL DEFAULT 'holiday' CHECK(day_type='holiday'),
 holiday_name text NOT NULL,
 academic_year text NOT NULL,
 source_url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.academic_calendar_default_days FROM PUBLIC,anon,authenticated;
INSERT INTO private.academic_calendar_default_days(date_key,holiday_name,academic_year,source_url)
SELECT d::date, v.name, '1448-1449',
 'https://rcjy.gov.sa/ar/general-education-calendar/'
FROM (VALUES
 (date '2026-09-23', date '2026-09-26','إجازة اليوم الوطني'),
 (date '2026-10-25', date '2026-10-25','إجازة إضافية للمدينة المنورة'),
 (date '2026-11-20', date '2026-11-28','إجازة الخريف'),
 (date '2027-01-08', date '2027-01-16','إجازة منتصف العام'),
 (date '2027-02-19', date '2027-02-22','إجازة يوم التأسيس'),
 (date '2027-02-26', date '2027-03-13','إجازة عيد الفطر'),
 (date '2027-04-30', date '2027-05-22','إجازة عيد الأضحى للمدينة المنورة')
) AS v(first_day,last_day,name)
CROSS JOIN LATERAL generate_series(v.first_day,v.last_day,interval '1 day') d
ON CONFLICT(date_key) DO UPDATE SET
 holiday_name=excluded.holiday_name,
 academic_year=excluded.academic_year,
 source_url=excluded.source_url;

-- Precedence: specific student > complex/circle override > verified official
-- calendar > ordinary study. Explicit "study" always wins over official holiday.
CREATE OR REPLACE FUNCTION private.effective_day_type(p_student_id text,p_date date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT coalesce(
  (SELECT x.day_type FROM public.student_day_types x
    WHERE x.student_id=p_student_id AND x.date_key=p_date),
  (SELECT x.day_type FROM public.circle_day_types x
    JOIN public.students s ON s.circle_id=x.circle_id
    WHERE s.id=p_student_id AND x.date_key=p_date),
  (SELECT x.day_type FROM private.academic_calendar_default_days x
    WHERE x.date_key=p_date),
  'study'
 );
$function$;
REVOKE ALL ON FUNCTION private.effective_day_type(text,date) FROM PUBLIC,anon,authenticated;

-- A single authorized transaction applies many days and many circles.
-- Bound the number of circle-day combinations; the UI chunks larger ranges.
CREATE OR REPLACE FUNCTION public.apply_calendar_days_bulk_guarded(
 p_circle_ids text[],p_dates date[],p_day_type text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' SET statement_timeout TO '20s'
AS $body$
DECLARE
 v_actor uuid:=(SELECT auth.uid());v_c text;v_d date;
 v_circle public.circles%rowtype;
 v_c_count integer;v_d_count integer;
 v_prior text;v_target text;v_changed integer:=0;v_enqueued integer:=0;v_one integer;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
  RAISE EXCEPTION 'يلزم حساب مشرف نشط لاعتماد أيام المجمع.' USING errcode='42501';
 END IF;
 v_c_count:=cardinality(p_circle_ids);
 v_d_count:=cardinality(p_dates);
 IF v_c_count IS NULL OR v_c_count NOT BETWEEN 1 AND 40 OR
    v_d_count IS NULL OR v_d_count NOT BETWEEN 1 AND 35 OR
    v_c_count*v_d_count>140 OR
    (SELECT count(DISTINCT x) FROM unnest(p_circle_ids) x WHERE x IS NOT NULL)<>v_c_count OR
    (SELECT count(DISTINCT x) FROM unnest(p_dates) x WHERE x IS NOT NULL)<>v_d_count OR
    p_day_type NOT IN ('holiday','study','test','unaccounted','default') THEN
   RAISE EXCEPTION 'اختر تصنيفًا صحيحًا، مع ١٤٠ يوم-حلقة كحد أعلى لكل دفعة.'
   USING errcode='22023';
 END IF;
 FOR v_c IN SELECT unnest(p_circle_ids) ORDER BY 1 LOOP
   SELECT * INTO v_circle FROM public.circles WHERE id=v_c AND active;
   IF NOT FOUND OR NOT private.can_access(v_circle.org_id,v_circle.complex_id,v_c,
     array['admin','manager','supervisor']::public.app_role[]) THEN
     RAISE EXCEPTION 'لا تملك صلاحية إحدى الحلقات المحددة.' USING errcode='42501';
   END IF;
 END LOOP;
 FOR v_c IN SELECT unnest(p_circle_ids) ORDER BY 1 LOOP
   FOR v_d IN SELECT unnest(p_dates) ORDER BY 1 LOOP
     PERFORM pg_advisory_xact_lock(hashtext(v_c),v_d-date '2000-01-01');
     SELECT coalesce(
      (SELECT t.day_type FROM public.circle_day_types t
        WHERE t.circle_id=v_c AND t.date_key=v_d),
      (SELECT h.day_type FROM private.academic_calendar_default_days h
        WHERE h.date_key=v_d),'study') INTO v_prior;
     v_target:=CASE WHEN p_day_type='default'
       THEN coalesce((SELECT h.day_type FROM private.academic_calendar_default_days h
         WHERE h.date_key=v_d),'study')
       ELSE p_day_type END;
     -- Prevent converting an already performed lesson to a nonstudy day.
     IF v_prior IS DISTINCT FROM v_target AND v_target<>'study'
       AND EXISTS(
        SELECT 1 FROM public.students s WHERE s.circle_id=v_c AND s.active AND (
         EXISTS(SELECT 1 FROM public.outcomes o
           WHERE o.student_id=s.id AND o.date_key=v_d) OR
         EXISTS(SELECT 1 FROM public.student_attendance a
           WHERE a.student_id=s.id AND a.date_key=v_d) OR
         EXISTS(SELECT 1 FROM public.talaqqin_assessments t
           WHERE t.student_id=s.id AND t.assessed_on=v_d) OR
         EXISTS(SELECT 1 FROM public.plan_days x JOIN public.plans p
           ON p.id=x.plan_id AND p.status='active'
           WHERE x.student_id=s.id AND x.date_key=v_d
           AND (x.rating IS NOT NULL OR coalesce(x.completed_amount,0)>0))
        )
       ) THEN
       RAISE EXCEPTION 'توجد حصائل أو حضور محفوظ للحلقة % بتاريخ %؛ لم يُغيَّر اليوم.',
         (SELECT name FROM public.circles WHERE id=v_c),v_d USING errcode='23514';
     END IF;
     IF p_day_type='default' THEN
       DELETE FROM public.circle_day_types
       WHERE circle_id=v_c AND date_key=v_d;
     ELSE
       INSERT INTO public.circle_day_types(circle_id,date_key,day_type,updated_by)
       VALUES(v_c,v_d,p_day_type,v_actor)
       ON CONFLICT(circle_id,date_key) DO UPDATE
       SET day_type=excluded.day_type,updated_by=excluded.updated_by,updated_at=now();
     END IF;
     IF v_prior IS DISTINCT FROM v_target THEN
       INSERT INTO public.day_type_audit(circle_id,student_id,date_key,before_type,after_type,actor_id)
       VALUES(v_c,NULL,v_d,v_prior,v_target,v_actor);
       v_changed:=v_changed+1;
     END IF;
   END LOOP;
 END LOOP;
 -- Only actively scheduled lessons are queued, and no student is reflowed
 -- twice if a successful previous job already shifted all days off the date.
 INSERT INTO private.calendar_day_reflow_queue(
   circle_id,date_key,student_id,day_type,approved_by,state)
 SELECT s.circle_id,d.date_key,s.id,private.effective_day_type(s.id,d.date_key),v_actor,'pending'
 FROM public.students s
 CROSS JOIN unnest(p_dates) AS d(date_key)
 WHERE s.circle_id=ANY(p_circle_ids) AND s.active
  AND private.effective_day_type(s.id,d.date_key)<>'study'
  AND EXISTS(SELECT 1 FROM public.plan_days pd JOIN public.plans p
    ON p.id=pd.plan_id AND p.status='active'
    WHERE pd.student_id=s.id AND pd.date_key=d.date_key)
 ON CONFLICT(circle_id,date_key,student_id) DO UPDATE SET
  day_type=excluded.day_type,approved_by=excluded.approved_by,
  state='pending',last_error=NULL,updated_at=now();
 GET DIAGNOSTICS v_enqueued=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'circles',v_c_count,'days',v_d_count,
   'changed',v_changed,'queuedStudents',v_enqueued,'defaultRestored',p_day_type='default');
END;
$body$;
REVOKE ALL ON FUNCTION public.apply_calendar_days_bulk_guarded(text[],date[],text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_calendar_days_bulk_guarded(text[],date[],text)
TO authenticated;

-- If a manager restores a lesson to "study" while it is still waiting for
-- reflow, the worker must not incorrectly move it later.
DO $patch_worker$
DECLARE f text;old text;new text;
BEGIN
 f:=pg_get_functiondef('private.process_calendar_day_reflow(integer)'::regprocedure);
 old:='   IF EXISTS(SELECT 1 FROM public.plan_days d'||chr(10)||
      '     JOIN public.plans p ON p.id=d.plan_id AND p.status=''active'''||chr(10)||
      '     WHERE d.student_id=task.student_id AND d.date_key=task.date_key) THEN';
 new:='   IF private.effective_day_type(task.student_id,task.date_key)=''study'' THEN'||chr(10)||
      '     affected:=0;'||chr(10)||
      '   ELSIF EXISTS(SELECT 1 FROM public.plan_days d'||chr(10)||
      '     JOIN public.plans p ON p.id=d.plan_id AND p.status=''active'''||chr(10)||
      '     WHERE d.student_id=task.student_id AND d.date_key=task.date_key) THEN';
 IF position(new in f)=0 THEN
   IF position(old in f)=0 THEN
     RAISE EXCEPTION 'خوارزمية التسوية تغيّرت؛ رفض تعديل العامل دون مراجعة.';
   END IF;
   EXECUTE replace(f,old,new);
 END IF;
END $patch_worker$;

-- A verified calendar must also reconcile already-approved, still-future
-- study plans, without touching ratings, old outcomes, or archive.
INSERT INTO private.calendar_day_reflow_queue(
 circle_id,date_key,student_id,day_type,approved_by,state)
SELECT DISTINCT p.circle_id,d.date_key,p.student_id,
 private.effective_day_type(p.student_id,d.date_key),
 supervisor.user_id,'pending'
FROM public.plan_days d
JOIN public.plans p ON p.id=d.plan_id AND p.status='active'
JOIN public.students s ON s.id=p.student_id AND s.active
JOIN private.academic_calendar_default_days h ON h.date_key=d.date_key
-- Only assign an authorized, currently active manager for that circle.
-- Never impersonate an arbitrary user.
JOIN LATERAL(
 SELECT m.user_id
 FROM public.memberships m JOIN public.profiles prof ON prof.id=m.user_id AND prof.active
 WHERE m.active AND m.role IN ('admin','manager','supervisor')
 AND (m.role='admin' OR (
   m.org_id=p.org_id
   AND (m.complex_id IS NULL OR m.complex_id=p.complex_id)
   AND (m.circle_id IS NULL OR m.circle_id=p.circle_id)))
 ORDER BY CASE WHEN m.role='supervisor' THEN 0 WHEN m.role='manager' THEN 1 ELSE 2 END,m.created_at
 LIMIT 1
) supervisor ON true
WHERE d.date_key >= (now() at time zone 'Asia/Riyadh')::date
  AND d.rating IS NULL AND coalesce(d.completed_amount,0)=0
  AND private.effective_day_type(p.student_id,d.date_key)<>'study'
ON CONFLICT(circle_id,date_key,student_id) DO NOTHING;
