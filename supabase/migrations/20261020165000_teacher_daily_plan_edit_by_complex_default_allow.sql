
-- Teacher may correct unrecorded student assignments by default.
-- The setting is scoped to each complex and writable only by its supervisor or administrators.
CREATE TABLE IF NOT EXISTS public.complex_teacher_plan_permissions (
 complex_id text PRIMARY KEY REFERENCES public.complexes(id) ON DELETE CASCADE,
 org_id text NOT NULL,
 allow_teacher_edit boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
ALTER TABLE public.complex_teacher_plan_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.complex_teacher_plan_permissions FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION private.can_teacher_edit_daily_plan(
 p_org_id text,p_complex_id text,p_circle_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
 SELECT private.can_access(p_org_id,p_complex_id,p_circle_id,
    ARRAY['teacher']::public.app_role[])
  AND private.current_teacher_id_for_circle(p_org_id,p_complex_id,p_circle_id) IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.complexes c
    WHERE c.id=p_complex_id AND c.org_id=p_org_id AND c.active)
  AND COALESCE((
    SELECT perms.allow_teacher_edit
    FROM public.complex_teacher_plan_permissions perms
    WHERE perms.complex_id=p_complex_id AND perms.org_id=p_org_id
  ),true);
$$;
REVOKE ALL ON FUNCTION private.can_teacher_edit_daily_plan(text,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_complex_teacher_plan_permission(p_complex_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
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
  'allowTeacherEdit',v_allowed,'canManage',v_manage);
END;
$$;
REVOKE ALL ON FUNCTION public.get_complex_teacher_plan_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_complex_teacher_plan_permission(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_complex_teacher_plan_permission(
 p_complex_id text,p_enabled boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
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
 SELECT coalesce((SELECT allow_teacher_edit
  FROM public.complex_teacher_plan_permissions
  WHERE complex_id=v_complex.id AND org_id=v_complex.org_id),true)
 INTO v_before;
 INSERT INTO public.complex_teacher_plan_permissions
  (complex_id,org_id,allow_teacher_edit,updated_at,updated_by)
 VALUES(v_complex.id,v_complex.org_id,p_enabled,now(),(SELECT auth.uid()))
 ON CONFLICT (complex_id) DO UPDATE
 SET allow_teacher_edit=EXCLUDED.allow_teacher_edit,
  updated_at=now(),updated_by=(SELECT auth.uid());
 IF v_before IS DISTINCT FROM p_enabled THEN
  INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
  VALUES(v_complex.org_id,'complex.teacher_plan_edit_permission_changed',
   (SELECT auth.uid()),'complex_teacher_plan_permissions',v_complex.id,
   jsonb_build_object('previous',v_before,'enabled',p_enabled));
 END IF;
 RETURN jsonb_build_object('ok',true,'complexId',v_complex.id,'allowTeacherEdit',p_enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.set_complex_teacher_plan_permission(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_complex_teacher_plan_permission(text,boolean) TO authenticated;

-- Repair protected edit authorization: adjust_daily_plan_assignment_guarded
CREATE OR REPLACE FUNCTION public.adjust_daily_plan_assignment_guarded(p_day_id text, p_amount integer DEFAULT NULL::integer, p_end_surah integer DEFAULT NULL::integer, p_end_ayah integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_day public.plan_days%rowtype;
 v_plan public.plans%rowtype;
 v_student public.students%rowtype;
 v_start_s integer; v_start_a integer; v_end_idx integer; v_to_q public.quran_ayahs%rowtype;
 v_next_s integer; v_next_a integer; v_max_ayah integer; v_seq integer;
 v_units numeric; v_from_ref jsonb; v_to_ref jsonb; v_segments jsonb;
 v_row record; v_chunk record; v_old_future integer:=0; v_new_future integer:=0;
 v_at integer:=0; v_cycle_total integer:=0; v_cycle_at integer;
 v_old_last date; v_last_date date; v_date date;
 v_rebuilt integer:=0; v_removed integer:=0; v_added integer:=0;
 v_is_full boolean:=false; v_linked_mem_id text; v_review_result jsonb; v_allowed_min integer; v_allowed_max integer;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
  RAISE EXCEPTION 'يجب تسجيل الدخول بحساب نشط.' USING ERRCODE='42501';
 END IF;
 IF (p_amount IS NULL)=(p_end_surah IS NULL OR p_end_ayah IS NULL) THEN
  RAISE EXCEPTION 'حدد مقدارًا جديدًا، أو نهاية يدوية للسورة والآية.';
 END IF;
 IF p_amount IS NOT NULL AND (p_amount<1 OR p_amount>45) THEN
  RAISE EXCEPTION 'المقدار يجب أن يكون بين 1 و45 وحدة.';
 END IF;
 SELECT * INTO v_day FROM public.plan_days WHERE id=p_day_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'مقرر اليوم غير موجود.'; END IF;
 SELECT * INTO v_plan FROM public.plans WHERE id=v_day.plan_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الخطة غير نشطة.'; END IF;
 SELECT * INTO v_student FROM public.students WHERE id=v_day.student_id AND active FOR UPDATE;
 IF NOT FOUND OR v_plan.student_id IS DISTINCT FROM v_student.id THEN
  RAISE EXCEPTION 'تعذر التحقق من الطالب وخطته.';
 END IF;
 IF NOT (
    private.can_access(v_student.org_id,v_student.complex_id,v_student.circle_id,
      ARRAY['admin','manager','supervisor']::public.app_role[])
    OR private.can_teacher_edit_daily_plan(v_student.org_id,v_student.complex_id,v_student.circle_id)
  ) THEN
  RAISE EXCEPTION 'لا تملك صلاحية تعديل مقرر هذا الطالب.' USING ERRCODE='42501';
 END IF;
 IF v_day.date_key=(timezone('Asia/Riyadh',now()))::date THEN
  PERFORM private.assert_circle_session_allowed(v_student.circle_id,v_day.date_key);
 END IF;
 IF v_day.rating IS NOT NULL OR coalesce(v_day.completed_amount,0)>0
    OR v_day.status<>'planned' OR
    EXISTS(SELECT 1 FROM public.outcomes
      WHERE student_id=v_student.id AND date_key=v_day.date_key) THEN
  RAISE EXCEPTION 'المقرر محفوظ أو منفذ؛ لا يمكن إعادة جدولة حصيلة معتمدة.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.plan_days d WHERE d.plan_id=v_plan.id
   AND d.date_key>v_day.date_key
   AND (d.rating IS NOT NULL OR d.status<>'planned'
     OR coalesce(d.completed_amount,0)>0 OR coalesce(d.carry_in,0)>0
     OR coalesce(d.carry_out,0)>0
     OR EXISTS(SELECT 1 FROM public.outcomes o
       WHERE o.student_id=v_student.id AND o.date_key=d.date_key))) THEN
  RAISE EXCEPTION 'توجد نتائج لاحقة مرتبطة بهذه الخطة؛ لا يمكن تغييرها دون المساس بسجل الطالب.';
 END IF;
 v_start_s := (v_day.target_from->>'surahNo')::integer;
 v_start_a := (v_day.target_from->>'ayahNo')::integer;
 IF v_start_s IS NULL OR v_start_a IS NULL THEN
  RAISE EXCEPTION 'بداية المقرر غير محددة في قاعدة القرآن.';
 END IF;
 IF p_amount IS NOT NULL THEN
  IF v_plan.unit::text='lines' THEN
   SELECT end_index,actual_lines INTO v_end_idx,v_units
   FROM private.quran_whole_ayah_line_chunk(v_start_s,v_start_a,v_plan.direction,p_amount)
   LIMIT 1;
  ELSE
   SELECT a.to_index, t.qty INTO v_end_idx,v_units
   FROM (SELECT max(seq) AS last_seq,count(*) AS qty
         FROM private.quran_plan_atoms(v_start_s,v_start_a,v_plan.direction,v_plan.unit)
         WHERE seq<=p_amount) t
   JOIN private.quran_plan_atoms(v_start_s,v_start_a,v_plan.direction,v_plan.unit) a
      ON a.seq=t.last_seq;
  END IF;
 ELSE
  IF v_plan.unit::text IN('quarter_hizb','half_hizb','hizb','juz') THEN
   RAISE EXCEPTION 'التقسيم الربعي يُعدّل بوحداته المعتمدة، وليس بنهاية آية جزئية.';
  END IF;
  SELECT * INTO v_to_q FROM public.quran_ayahs
    WHERE surah_no=p_end_surah AND ayah_no=p_end_ayah;
  IF NOT FOUND THEN RAISE EXCEPTION 'آية النهاية المحددة غير موجودة.'; END IF;
  SELECT seq INTO v_seq FROM private.quran_plan_atoms(
    v_start_s,v_start_a,v_plan.direction,'ayahs'::public.plan_unit)
    WHERE to_index=v_to_q.ayah_index LIMIT 1;
  IF v_seq IS NULL OR v_seq>750 THEN
   RAISE EXCEPTION 'آية النهاية خارج اتجاه التسميع أو أبعد من المقدار المسموح.';
  END IF;
  v_end_idx:=v_to_q.ayah_index;
  IF v_plan.unit::text='ayahs' THEN
   v_units:=v_seq;
  ELSIF v_plan.unit::text='surahs' THEN
   SELECT count(DISTINCT q.surah_no) INTO v_units
   FROM private.quran_plan_atoms(v_start_s,v_start_a,v_plan.direction,'ayahs'::public.plan_unit) a
   JOIN public.quran_ayahs q ON q.ayah_index=a.from_index
   WHERE a.seq<=v_seq;
  ELSIF v_plan.unit::text='pages' THEN
   SELECT count(DISTINCT q.page_no) INTO v_units
   FROM private.quran_plan_atoms(v_start_s,v_start_a,v_plan.direction,'ayahs'::public.plan_unit) a
   JOIN public.quran_ayahs q ON q.ayah_index=a.from_index
   WHERE a.seq<=v_seq;
  ELSIF v_plan.unit::text='lines' THEN
   SELECT count(*) INTO v_units FROM (
    SELECT DISTINCT q.page_no,ln.line_no
    FROM private.quran_plan_atoms(v_start_s,v_start_a,v_plan.direction,'ayahs'::public.plan_unit) a
    JOIN public.quran_ayahs q ON q.ayah_index=a.from_index
    CROSS JOIN LATERAL generate_series(q.line_start::integer,q.line_end::integer) ln(line_no)
    WHERE a.seq<=v_seq
   ) physically_distinct_lines;
  END IF;
 END IF;
 IF v_end_idx IS NULL OR coalesce(v_units,0)<1 THEN
  RAISE EXCEPTION 'لا توجد آيات يمكن توزيعها لهذا المقدار.';
 END IF;
 SELECT * INTO v_to_q FROM public.quran_ayahs WHERE ayah_index=v_end_idx;
 v_to_ref:=private.quran_target_ref(v_end_idx,
   v_to_q.page_no::integer,v_to_q.line_end::integer);
 v_from_ref:=v_day.target_from;
 v_segments:=private.quran_range_segments(
   (v_from_ref->>'ayahIndex')::integer,v_end_idx);
 SELECT max(ayah_no) INTO v_max_ayah FROM public.quran_ayahs
  WHERE surah_no=v_to_q.surah_no;
 IF v_to_q.ayah_no<v_max_ayah THEN
  v_next_s:=v_to_q.surah_no;v_next_a:=v_to_q.ayah_no+1;
 ELSE
  v_next_s:=v_to_q.surah_no+CASE WHEN v_plan.direction='toward_nas'::public.plan_direction THEN 1 ELSE -1 END;
  v_next_a:=1;
 END IF;
 SELECT max(date_key),count(*) FILTER (WHERE date_key>v_day.date_key)
  INTO v_old_last,v_old_future
 FROM public.plan_days WHERE plan_id=v_plan.id;
 v_is_full := v_plan.end_date<=v_old_last;
 CREATE TEMP TABLE IF NOT EXISTS _sanabil_adjust_future_chunks(
  n integer PRIMARY KEY,from_idx integer,to_idx integer,
  from_page integer,to_page integer,from_line integer,to_line integer,units numeric
 ) ON COMMIT DROP;
 TRUNCATE _sanabil_adjust_future_chunks;
 IF v_next_s BETWEEN 1 AND 114 THEN
  IF v_plan.unit::text='lines' THEN
   INSERT INTO _sanabil_adjust_future_chunks
    SELECT day_seq,from_index,to_index,from_page,to_page,from_line,to_line,actual_lines
    FROM private.quran_memorization_line_chunks(v_next_s,v_next_a,v_plan.direction,v_plan.daily_amount);
  ELSE
   INSERT INTO _sanabil_adjust_future_chunks
   SELECT row_number() OVER(ORDER BY grp)::integer,
    (array_agg(from_index ORDER BY seq))[1],
    (array_agg(to_index ORDER BY seq DESC))[1],
    (array_agg(from_page ORDER BY seq))[1],
    (array_agg(to_page ORDER BY seq DESC))[1],
    (array_agg(from_line ORDER BY seq))[1],
    (array_agg(to_line ORDER BY seq DESC))[1],
    count(*)::numeric
   FROM (SELECT a.*,(a.seq-1)/greatest(1,v_plan.daily_amount) grp
     FROM private.quran_plan_atoms(v_next_s,v_next_a,v_plan.direction,v_plan.unit) a) z
   GROUP BY grp ORDER BY grp;
  END IF;
 END IF;
 SELECT count(*) INTO v_new_future FROM _sanabil_adjust_future_chunks;
 IF v_plan.type='review' THEN
  CREATE TEMP TABLE IF NOT EXISTS _sanabil_adjust_review_cycle(
    n integer PRIMARY KEY,from_idx integer,to_idx integer,
    from_page integer,to_page integer,from_line integer,to_line integer,units numeric
  ) ON COMMIT DROP;
  TRUNCATE _sanabil_adjust_review_cycle;
  IF v_plan.unit::text='lines' THEN
   INSERT INTO _sanabil_adjust_review_cycle
    SELECT day_seq,from_index,to_index,from_page,to_page,from_line,to_line,actual_lines
    FROM private.quran_memorization_line_chunks(
      (v_plan.start_ref->>'surahNo')::integer,(v_plan.start_ref->>'ayahNo')::integer,
      v_plan.direction,v_plan.daily_amount);
  ELSE
   INSERT INTO _sanabil_adjust_review_cycle
   SELECT row_number() OVER(ORDER BY grp)::integer,
    (array_agg(from_index ORDER BY seq))[1],
    (array_agg(to_index ORDER BY seq DESC))[1],
    (array_agg(from_page ORDER BY seq))[1],
    (array_agg(to_page ORDER BY seq DESC))[1],
    (array_agg(from_line ORDER BY seq))[1],
    (array_agg(to_line ORDER BY seq DESC))[1],
    count(*)::numeric
   FROM (SELECT a.*,(a.seq-1)/greatest(1,v_plan.daily_amount) grp
      FROM private.quran_plan_atoms(
      (v_plan.start_ref->>'surahNo')::integer,(v_plan.start_ref->>'ayahNo')::integer,
      v_plan.direction,v_plan.unit) a) z
   GROUP BY grp ORDER BY grp;
  END IF;
  SELECT count(*) INTO v_cycle_total FROM _sanabil_adjust_review_cycle;
 END IF;
 IF v_plan.type IN('recent_review','review') THEN
   SELECT min(least(
     (d.target_from->>'ayahIndex')::integer,
     (d.target_to->>'ayahIndex')::integer)),
     max(greatest(
     (d.target_from->>'ayahIndex')::integer,
     (d.target_to->>'ayahIndex')::integer))
     INTO v_allowed_min,v_allowed_max
   FROM public.plan_days d
   WHERE d.plan_id=v_plan.id AND d.date_key>=v_day.date_key
     AND d.target_from ? 'ayahIndex' AND d.target_to ? 'ayahIndex';
   IF v_allowed_min IS NULL OR v_allowed_max IS NULL THEN
     RAISE EXCEPTION 'تعذر التحقق من حدود محفوظ الطالب في خطة المراجعة.';
   END IF;
   IF v_end_idx NOT BETWEEN v_allowed_min AND v_allowed_max THEN
     RAISE EXCEPTION 'آية النهاية خارج حدود المراجعة المجدولة أو محفوظ الطالب؛ اختر مقدارًا ضمن خطة الطالب.';
   END IF;
 END IF;
 UPDATE public.plan_days SET
   target_from=v_from_ref,target_to=v_to_ref,target_amount=v_units,
   carry_in=0,carry_out=0,carry_from=NULL,segments=v_segments,
   display_label=NULL,updated_at=now(),updated_by=v_actor
 WHERE id=v_day.id;
 v_last_date:=v_day.date_key;
 IF v_plan.type='recent_review' THEN
   SELECT p.id INTO v_linked_mem_id FROM public.plans p
   WHERE p.student_id=v_student.id AND p.type='memorization'
     AND p.status='active' AND p.start_date<=v_day.date_key AND p.end_date>=v_day.date_key
   ORDER BY p.updated_at DESC LIMIT 1;
   IF v_linked_mem_id IS NULL THEN RAISE EXCEPTION 'لا توجد خطة حفظ مرتبطة بالمراجعة الصغرى.'; END IF;
   PERFORM private.sync_recent_review_plan(v_plan.id,v_linked_mem_id,v_day.date_key+1);
   INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
   VALUES(v_student.org_id,'plan.daily_amount_adjusted',v_actor,'plan_days',v_day.id,
    jsonb_build_object('date',v_day.date_key,'planId',v_plan.id,'track','recent_review',
      'beforeAmount',v_day.target_amount,'afterAmount',v_units,'afterTo',v_to_ref,
      'futureRule','memorization_linked_window'));
   RETURN jsonb_build_object('ok',true,'date',v_day.date_key,'planId',v_plan.id,
    'dayId',v_day.id,'from',v_from_ref,'to',v_to_ref,'amount',v_units,
    'futureRule','memorization_linked_window');
 ELSIF v_plan.type='review' AND
    (v_plan.unit::text IN('quarter_hizb','half_hizb','hizb','juz') OR
      (v_plan.unit::text IN('pages','ayahs','surahs')
       AND coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy') IN('lesson','surah'))) THEN
   UPDATE public.plan_days SET status='manual_adjustment_pending' WHERE id=v_day.id;
   IF v_plan.unit::text IN('quarter_hizb','half_hizb','hizb','juz') THEN
     -- The original QPC rebuild uses target_from as the cursor for
     -- toward_fatiha; temporarily expose the teacher's corrected endpoint.
     IF v_plan.direction='toward_fatiha'::public.plan_direction THEN
       UPDATE public.plan_days SET target_from=v_to_ref WHERE id=v_day.id;
     END IF;
     SELECT private.rebuild_qpc_major_review_against_recent(v_plan.id) INTO v_review_result;
   ELSE
     SELECT private.rebuild_linear_major_review_against_recent(v_plan.id) INTO v_review_result;
   END IF;
   IF coalesce((v_review_result->>'skipped')::boolean,false) THEN
      RAISE EXCEPTION 'لا توجد مراجعة صغرى مرتبطة تعيد جدولة المراجعة الكبرى؛ راجع الخطة.';
   END IF;
   UPDATE public.plan_days SET status='planned',target_from=v_from_ref,updated_at=now() WHERE id=v_day.id;
   INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
   VALUES(v_student.org_id,'plan.daily_amount_adjusted',v_actor,'plan_days',v_day.id,
    jsonb_build_object('date',v_day.date_key,'planId',v_plan.id,'track','review',
      'beforeAmount',v_day.target_amount,'afterAmount',v_units,'afterTo',v_to_ref,
      'futureRule','major_review_memorized_span'));
   RETURN jsonb_build_object('ok',true,'date',v_day.date_key,'planId',v_plan.id,
    'dayId',v_day.id,'from',v_from_ref,'to',v_to_ref,'amount',v_units,
    'futureRule','major_review_memorized_span');
 END IF;
 FOR v_row IN
  SELECT * FROM public.plan_days WHERE plan_id=v_plan.id
   AND date_key>v_day.date_key ORDER BY date_key,id FOR UPDATE
 LOOP
  v_at:=v_at+1;v_chunk:=NULL;
  SELECT * INTO v_chunk FROM _sanabil_adjust_future_chunks WHERE n=v_at;
  IF NOT FOUND AND v_plan.type='review' AND v_cycle_total>0 THEN
   v_cycle_at:=((v_at-v_new_future-1)%v_cycle_total)+1;
   SELECT * INTO v_chunk FROM _sanabil_adjust_review_cycle WHERE n=v_cycle_at;
  END IF;
  IF v_chunk.to_idx IS NULL THEN
   DELETE FROM public.plan_days WHERE id=v_row.id;
   v_removed:=v_removed+1;
   CONTINUE;
  END IF;
  UPDATE public.plan_days SET
   target_from=private.quran_target_ref(v_chunk.from_idx,v_chunk.from_page,v_chunk.from_line),
   target_to=private.quran_target_ref(v_chunk.to_idx,v_chunk.to_page,v_chunk.to_line),
   target_amount=v_chunk.units,carry_in=0,carry_out=0,carry_from=NULL,
   segments=private.quran_range_segments(v_chunk.from_idx,v_chunk.to_idx),
   display_label=NULL,updated_at=now(),updated_by=v_actor
  WHERE id=v_row.id;
  v_last_date:=v_row.date_key;
  v_rebuilt:=v_rebuilt+1;
 END LOOP;
 IF v_plan.type='memorization' AND v_is_full AND v_new_future>v_old_future THEN
  FOR v_date IN
   SELECT gs::date FROM generate_series(v_old_last+interval '1 day',
    v_old_last+interval '365 days',interval '1 day') gs
   WHERE NOT extract(dow from gs)::smallint=ANY(coalesce(v_plan.excluded_weekdays,ARRAY[]::smallint[]))
     AND NOT gs::date=ANY(coalesce(v_plan.excluded_dates,ARRAY[]::date[]))
   ORDER BY gs LIMIT (v_new_future-v_old_future)
  LOOP
   v_at:=v_at+1;
   SELECT * INTO v_chunk FROM _sanabil_adjust_future_chunks WHERE n=v_at;
   EXIT WHEN NOT FOUND;
   INSERT INTO public.plan_days(
      id,plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
      target_from,target_to,target_amount,completed_amount,carry_in,carry_out,
      status,created_by,updated_by,cycle_no,segments
   ) VALUES(
      extensions.gen_random_uuid()::text,v_plan.id,v_day.org_id,v_day.complex_id,
      v_day.circle_id,v_day.student_id,v_day.teacher_id,v_date,
      private.quran_target_ref(v_chunk.from_idx,v_chunk.from_page,v_chunk.from_line),
      private.quran_target_ref(v_chunk.to_idx,v_chunk.to_page,v_chunk.to_line),
      v_chunk.units,0,0,0,'planned',v_actor,v_actor,1,
      private.quran_range_segments(v_chunk.from_idx,v_chunk.to_idx)
   );
   v_last_date:=v_date;v_added:=v_added+1;
  END LOOP;
 END IF;
 UPDATE public.plans SET
  end_date=CASE WHEN v_is_full THEN v_last_date ELSE end_date END,
  projected_completion_date=CASE WHEN v_is_full THEN v_last_date ELSE projected_completion_date END,
  materialized_through=v_last_date,
  updated_at=now(),updated_by=v_actor
 WHERE id=v_plan.id;
 PERFORM private.recalculate_plan_carry(v_plan.id);
 IF v_plan.type='memorization' THEN
  PERFORM public.sync_student_review_plans(v_student.id);
 END IF;
 INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
 VALUES(v_student.org_id,'plan.daily_amount_adjusted',v_actor,'plan_days',v_day.id,
  jsonb_build_object('date',v_day.date_key,'planId',v_plan.id,
    'beforeFrom',v_day.target_from,'beforeTo',v_day.target_to,
    'afterTo',v_to_ref,'beforeAmount',v_day.target_amount,'afterAmount',v_units,
    'newFuture',v_rebuilt,'removedUnrated',v_removed,'addedDays',v_added));
 RETURN jsonb_build_object('ok',true,'date',v_day.date_key,'planId',v_plan.id,
   'dayId',v_day.id,'from',v_from_ref,'to',v_to_ref,
   'amount',v_units,'futureRebuilt',v_rebuilt,'futureAdded',v_added,
   'futureRemoved',v_removed,'lastDate',v_last_date);
END $function$
;

-- Repair protected edit authorization: update_quran_daily_range_guarded
CREATE OR REPLACE FUNCTION public.update_quran_daily_range_guarded(p_day_id text, p_from_surah integer, p_from_ayah integer, p_to_surah integer, p_to_ayah integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_day public.plan_days%rowtype;
  v_plan public.plans%rowtype;
  v_student public.students%rowtype;
  v_from public.quran_ayahs%rowtype;
  v_to public.quran_ayahs%rowtype;
  v_amount integer;
  v_result jsonb;
  v_old_from jsonb;
  v_new_from jsonb;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;
  select * into v_day from public.plan_days where id=p_day_id for update;
  if not found then raise exception 'مقرر اليوم غير موجود؛ أعد تحميل الحلقة.'; end if;
  select * into v_plan from public.plans where id=v_day.plan_id and status='active';
  if not found then raise exception 'الخطة المرتبطة بهذا الدرس غير نشطة.'; end if;
  select * into v_student from public.students where id=v_day.student_id and active;
  if not found then raise exception 'بيانات الطالب غير نشطة.'; end if;
  IF NOT (
    private.can_access(v_student.org_id,v_student.complex_id,v_student.circle_id,
      ARRAY['admin','manager','supervisor']::public.app_role[])
    OR private.can_teacher_edit_daily_plan(v_student.org_id,v_student.complex_id,v_student.circle_id)
  ) THEN
    raise exception 'لا تملك صلاحية تعديل مقرر هذا الطالب.' using errcode='42501';
  end if;
  if v_day.status <> 'planned' or v_day.rating is not null or
     coalesce(v_day.completed_amount,0)>0 or exists(
       select 1 from public.outcomes o
       where o.student_id=v_day.student_id and o.date_key=v_day.date_key
     ) then
    raise exception 'المقرر تم حفظ حصيلته أو إنجازه؛ لا يمكن إعادة جدولته دون تصحيح الحصيلة أولًا.';
  end if;
  select * into v_from from public.quran_ayahs where surah_no=p_from_surah and ayah_no=p_from_ayah;
  select * into v_to from public.quran_ayahs where surah_no=p_to_surah and ayah_no=p_to_ayah;
  if v_from.ayah_index is null or v_to.ayah_index is null then
    raise exception 'تأكد من صحة سورتي البداية والنهاية ورقمي الآيتين.';
  end if;
  if v_plan.unit::text in ('quarter_hizb','half_hizb','hizb','juz') then
    select atom.seq into v_amount
    from private.quran_plan_atoms(p_from_surah,p_from_ayah,v_plan.direction,v_plan.unit) atom
    where atom.to_index=v_to.ayah_index and atom.seq between 1 and 45
    order by atom.seq limit 1;
    if v_amount is null then
      raise exception 'نهاية المراجعة الكبرى يجب أن توافق نهاية جزء أو حزب أو نصفه أو ربعه بحسب خطة الطالب. اختر الحد المعتمد لهذه الوحدة.';
    end if;
  else
    -- The underlying guarded plan routine validates direction, ayah completeness,
    -- memorized span and any later completed day before rebuilding future days.
    v_amount := null;
  end if;
  v_old_from:=v_day.target_from;
  v_new_from:=private.quran_target_ref(v_from.ayah_index,v_from.page_no::integer,v_from.line_start::integer);
  if v_old_from->>'ayahIndex' is distinct from v_new_from->>'ayahIndex' then
    -- Atomic within this RPC: any failure in the guarded rescheduler reverts
    -- this temporary cursor update and leaves every previously saved grade intact.
    update public.plan_days set target_from=v_new_from,carry_from=null,updated_at=now(),
      updated_by=v_actor where id=v_day.id;
  end if;
  v_result:=public.adjust_daily_plan_assignment_guarded(
    p_day_id,v_amount,
    case when v_amount is null then p_to_surah else null end,
    case when v_amount is null then p_to_ayah else null end
  );
  insert into public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
  values(v_student.org_id,'plan.daily_range_edited',v_actor,'plan_days',v_day.id,
    jsonb_build_object(
      'date',v_day.date_key,'planId',v_day.plan_id,
      'oldFrom',v_old_from,'newFrom',v_new_from,
      'oldTo',v_day.target_to,'newTo',v_result->'to',
      'mode','surah_ayah_inline'
    ));
  return v_result||jsonb_build_object('from',v_new_from,'oldFrom',v_old_from,'ok',true);
end;
$function$
;
