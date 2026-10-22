-- Atomic correction of completed daily Quran ranges without grade loss.
-- Only current authorized teacher/manager; denies dependent future results.
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
  v_was_saved boolean := false;
  v_saved_outcome public.outcomes%rowtype;
  v_saved_attendance public.student_attendance%rowtype;
  v_saved_ratings jsonb;
  v_restore jsonb;
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
  v_was_saved := (v_day.status <> 'planned' or v_day.rating is not null or
     coalesce(v_day.completed_amount,0)>0 or exists(
       select 1 from public.outcomes o
       where o.student_id=v_day.student_id and o.date_key=v_day.date_key
     ));
  select * into v_from from public.quran_ayahs where surah_no=p_from_surah and ayah_no=p_from_ayah;
  select * into v_to from public.quran_ayahs where surah_no=p_to_surah and ayah_no=p_to_ayah;
  if v_from.ayah_index is null or v_to.ayah_index is null then
    raise exception 'تأكد من صحة سورتي البداية والنهاية ورقمي الآيتين.';
  end if;
  -- No-op edits must not rebuild hundreds of future days.
  -- Permission, active-plan and completed-day checks have already passed.
  if (v_day.target_from->>'ayahIndex')=v_from.ayah_index::text
     and (v_day.target_to->>'ayahIndex')=v_to.ayah_index::text then
    return jsonb_build_object(
      'ok',true,'unchanged',true,'dayId',v_day.id,'planId',v_plan.id,
      'from',v_day.target_from,'to',v_day.target_to
    );
  end if;
  -- A named quarter/half-hizb/hizb/juz cannot start in the middle of that division.
  -- This is a policy guard for new manual edits; historical rated rows are unchanged.
  IF v_plan.unit::text IN ('quarter_hizb','half_hizb','hizb','juz') THEN
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT MIN(d.from_index)::integer AS boundary
        FROM public.quran_divisions d
        GROUP BY CASE v_plan.unit::text
          WHEN 'quarter_hizb' THEN d.rub_no
          WHEN 'half_hizb' THEN CEIL(d.rub_no::numeric/2)::integer
          WHEN 'hizb' THEN d.hizb_no
          WHEN 'juz' THEN d.juz_no END
      ) canonical
      WHERE canonical.boundary=v_from.ayah_index
    ) THEN
      RAISE EXCEPTION 'بداية المقرر تقع داخل وحدة التحزيب، فلا يصح عرض المقطع بوصفه حزبًا أو جزءًا كاملًا. اختر بداية التقسيم المعتمد، أو غيّر وحدة الخطة إلى صفحات/آيات.' USING ERRCODE='23514';
    END IF;
  END IF;
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
  -- An already assessed range can be corrected atomically only when no
  -- later result or carry depends on it. Preserve its grade and attendance,
  -- rebuild the untouched future, then replay the original assessment.
  if v_was_saved then
    perform private.assert_circle_session_allowed(v_student.circle_id,v_day.date_key);
    if v_day.status <> 'completed' or
       v_day.rating not in ('ممتاز','جيد جدًا','جيد') or
       coalesce(v_day.carry_in,0)<>0 or coalesce(v_day.carry_out,0)<>0 then
      raise exception 'هذا المقرر مرتبط بترحيل أو تقدير غير مكتمل؛ يلزم تصحيحه إداريًا دون تغيير النتائج السابقة.' using errcode='55000';
    end if;
    if exists(
      select 1 from public.plan_days pd
      where pd.student_id=v_day.student_id and pd.date_key>v_day.date_key
        and (pd.rating is not null or pd.status<>'planned'
          or coalesce(pd.completed_amount,0)>0 or coalesce(pd.carry_in,0)>0
          or coalesce(pd.carry_out,0)>0)
    ) then
      raise exception 'توجد حصائل أو ترحيلات لاحقة مرتبطة بالطالب؛ التصحيح يتطلب مراجعة المشرف لحماية النتائج.' using errcode='55000';
    end if;
    select * into v_saved_outcome from public.outcomes o
      where o.student_id=v_day.student_id and o.date_key=v_day.date_key for update;
    if not found then
      raise exception 'تعذر استرجاع الحصيلة المحفوظة لإتمام التصحيح الآمن.' using errcode='55000';
    end if;
    select * into v_saved_attendance from public.student_attendance a
      where a.student_id=v_day.student_id and a.date_key=v_day.date_key for update;
    if not found or v_saved_attendance.status not in ('present','late') then
      raise exception 'حالة حضور الطالب غير متوافقة مع تعديل حصيلة معتمدة.' using errcode='55000';
    end if;
    select jsonb_strip_nulls(jsonb_build_object(
      'memorization',(select pd.rating from public.plan_days pd join public.plans p on p.id=pd.plan_id
         where pd.student_id=v_day.student_id and pd.date_key=v_day.date_key and p.status='active' and p.type='memorization' limit 1),
      'recentReview',(select pd.rating from public.plan_days pd join public.plans p on p.id=pd.plan_id
         where pd.student_id=v_day.student_id and pd.date_key=v_day.date_key and p.status='active' and p.type='recent_review' limit 1),
      'reviewPlans',coalesce((select jsonb_object_agg(pd.plan_id,pd.rating)
        from public.plan_days pd join public.plans p on p.id=pd.plan_id
        where pd.student_id=v_day.student_id and pd.date_key=v_day.date_key
          and p.status='active' and p.type='review' and pd.rating is not null),'{}'::jsonb)
    )) into v_saved_ratings;
    -- Save all source information before changing the ranges. Any error
    -- rolls back these temporary changes and restores the original grade.
    delete from public.outcomes o
      where o.student_id=v_day.student_id and o.date_key=v_day.date_key;
    update public.plan_days set rating=null,completed_amount=0,carry_out=0,
      status='planned',updated_at=now(),updated_by=v_actor
      where id=v_day.id;
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
  if v_was_saved then
    v_restore:=public.save_daily_outcomes_v2(
      v_day.date_key,
      jsonb_build_array(jsonb_build_object(
        'studentId',v_day.student_id,
        'attendanceStatus',v_saved_attendance.status,
        'attendanceNote',v_saved_attendance.note,
        'absenceReason',v_saved_attendance.absence_reason,
        'notes',v_saved_outcome.notes,
        'recitationMetrics',coalesce(v_saved_outcome.recitation_metrics,'{}'::jsonb),
        'ratings',v_saved_ratings
      ))
    );
    if coalesce((v_restore->>'ok')::boolean,false) is not true then
      raise exception 'فشل إعادة تطبيق الحصيلة بعد تصحيح المقرر؛ لم تتغير البيانات.' using errcode='55000';
    end if;
  end if;
  insert into public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
  values(v_student.org_id,'plan.daily_range_edited',v_actor,'plan_days',v_day.id,
    jsonb_build_object(
      'date',v_day.date_key,'planId',v_day.plan_id,
      'oldFrom',v_old_from,'newFrom',v_new_from,
      'oldTo',v_day.target_to,'newTo',v_result->'to',
      'mode',case when v_was_saved then 'surah_ayah_assessed_correction' else 'surah_ayah_inline' end
    ));
  return v_result||jsonb_build_object('from',v_new_from,'oldFrom',v_old_from,'ok',true,'assessmentRestored',v_was_saved);
end;
$function$
;
