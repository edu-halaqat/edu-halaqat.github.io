-- Skip redundant rescheduling when teacher re-saves an identical passage.
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
  -- No-op edits must not rebuild hundreds of future days.
  -- Permission, active-plan and completed-day checks have already passed.
  if (v_day.target_from->>'ayahIndex')=v_from.ayah_index::text
     and (v_day.target_to->>'ayahIndex')=v_to.ayah_index::text then
    return jsonb_build_object(
      'ok',true,'unchanged',true,'dayId',v_day.id,'planId',v_plan.id,
      'from',v_day.target_from,'to',v_day.target_to
    );
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
