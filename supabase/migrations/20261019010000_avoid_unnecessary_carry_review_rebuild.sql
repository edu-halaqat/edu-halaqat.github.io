-- Material-change guards; preserves existing historical and planned rows when grades are unchanged.
CREATE OR REPLACE FUNCTION public.save_daily_outcomes_v2(p_date date, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_row jsonb;
  v_student public.students%rowtype;
  v_teacher_id text;
  v_notes text;
  v_att_status text;
  v_att_note text;
  v_absence_reason text;
  v_metrics jsonb;
  v_ratings jsonb;
  v_review_plan_ratings jsonb;
  v_mem_rating text;
  v_recent_rating text;
  v_review_rating text;
  v_track_rating text;
  v_day record;
  v_next public.plan_days%rowtype;
  v_effective_from jsonb;
  v_due numeric(8,2);
  v_lesson_text text;
  v_recent_review_text text;
  v_review_text text;
  v_saved integer:=0;
  v_candidate date;
  v_excluded smallint[];
  v_excluded_dates date[];
  v_plan_id text;
  v_has_plan boolean;
  v_review_seen boolean;
  v_review_worst integer;
  v_score integer;
  v_any_carry boolean;
  v_need_review_sync boolean;
begin
  if v_actor is null or not private.active_user() then raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501'; end if;
  if p_date is null then raise exception 'التاريخ مطلوب.'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>150 then
    raise exception 'دفعة الحصيلة غير صالحة.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    select * into v_student from public.students where id=btrim(v_row->>'studentId') and active;
    if not found then raise exception 'يوجد طالب غير موجود أو غير نشط.'; end if;
    if private.effective_day_type(v_student.id,p_date)<>'study' then
      raise exception 'هذا اليوم مصنف إجازة أو اختبارًا أو غير محتسب؛ استخدم مسار الحفظ المخصص له.';
    end if;

    if not private.can_access(v_student.org_id,v_student.complex_id,v_student.circle_id,array['admin','manager','supervisor','teacher']::public.app_role[]) then
      raise exception 'لا تملك صلاحية رصد حصيلة الطالب %.',v_student.full_name using errcode='42501';
    end if;

    v_teacher_id:=coalesce(v_student.teacher_id,(select t.id from public.teachers t where t.user_id=v_actor and t.org_id=v_student.org_id and t.complex_id=v_student.complex_id and t.circle_id=v_student.circle_id and t.active limit 1));
    if v_teacher_id is null then raise exception 'يجب تعيين معلم للطالب %.',v_student.full_name; end if;
    if not(private.can_access(v_student.org_id,v_student.complex_id,v_student.circle_id,array['admin','manager','supervisor']::public.app_role[])
      or private.teacher_can_write(v_student.org_id,v_student.complex_id,v_student.circle_id,v_teacher_id)) then
      raise exception 'لا يحق لك رصد حصيلة هذا الطالب.' using errcode='42501';
    end if;

    v_notes:=nullif(btrim(coalesce(v_row->>'notes','')),'');
    v_att_status:=nullif(btrim(coalesce(v_row->>'attendanceStatus','')),'');
    v_att_note:=nullif(btrim(coalesce(v_row->>'attendanceNote','')),'');
    v_absence_reason:=nullif(btrim(coalesce(v_row->>'absenceReason','')),'');
    if v_att_status='absent' and (v_absence_reason is null or v_absence_reason not in('excused','unexcused')) then
      raise exception 'حدد نوع غياب الطالب %: بعذر أو بدون عذر.',v_student.full_name;
    end if;
    if v_att_status<>'absent' then v_absence_reason:=null;end if;
    v_metrics:=coalesce(v_row->'recitationMetrics','{}'::jsonb);
    v_ratings:=coalesce(v_row->'ratings','{}'::jsonb);
    v_review_plan_ratings:=coalesce(v_ratings->'reviewPlans','{}'::jsonb);

    if v_att_status is null or v_att_status not in('present','late','excused','absent') then raise exception 'اختر حالة حضور صحيحة للطالب %.',v_student.full_name; end if;
    if jsonb_typeof(v_metrics)<>'object' then raise exception 'تفاصيل التسميع غير صالحة للطالب %.',v_student.full_name; end if;
    if jsonb_typeof(v_ratings)<>'object' then raise exception 'تقديرات المسارات غير صالحة للطالب %.',v_student.full_name; end if;
    if jsonb_typeof(v_review_plan_ratings)<>'object' then raise exception 'تقديرات المراجعات الكبرى غير صالحة للطالب %.',v_student.full_name; end if;

    if exists(
      select 1 from jsonb_each(v_metrics) tr(k,v)
      where tr.k not in('memorization','recentReview','review','reviewPlans')
         or case
              when jsonb_typeof(tr.v)<>'object' then true
              when tr.k='reviewPlans' then exists(
                select 1 from jsonb_each(tr.v) rp(k,v)
                where case
                  when jsonb_typeof(rp.v)<>'object' then true
                  else exists(select 1 from jsonb_each(rp.v) x(k,v)
                    where x.k not in('errors','doubts','tajweed') or
  case when jsonb_typeof(x.v)<>'number' then true
       else (((x.v)::text)::numeric not between 0 and 100 or mod(((x.v)::text)::numeric,1)<>0)
  end)
                end
              )
              else exists(select 1 from jsonb_each(tr.v) x(k,v)
                where x.k not in('errors','doubts','tajweed') or
  case when jsonb_typeof(x.v)<>'number' then true
       else (((x.v)::text)::numeric not between 0 and 100 or mod(((x.v)::text)::numeric,1)<>0)
  end)
            end
    ) then raise exception 'تفاصيل التسميع يجب أن تكون أعدادًا صحيحة من 0 إلى 100.'; end if;

    if exists(
      select 1 from jsonb_each_text(v_review_plan_ratings) q(k,v)
      where q.v not in('ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع')
    ) then raise exception 'يوجد تقدير غير صالح في إحدى المراجعات الكبرى للطالب %.',v_student.full_name; end if;

    v_mem_rating:=nullif(btrim(coalesce(v_ratings->>'memorization','')),'');
    v_recent_rating:=nullif(btrim(coalesce(v_ratings->>'recentReview','')),'');
    if exists(select 1 from(values(v_mem_rating),(v_recent_rating))q(x) where x is not null and x not in('ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع')) then
      raise exception 'يوجد تقدير غير صالح للطالب %.',v_student.full_name;
    end if;

    insert into public.student_attendance(org_id,complex_id,circle_id,student_id,teacher_id,date_key,status,note,absence_reason,created_by,updated_by)
    values(v_student.org_id,v_student.complex_id,v_student.circle_id,v_student.id,v_teacher_id,p_date,v_att_status,v_att_note,v_absence_reason,v_actor,v_actor)
    on conflict(student_id,date_key) do update set status=excluded.status,note=excluded.note,absence_reason=excluded.absence_reason,teacher_id=excluded.teacher_id,marked_at=now(),updated_at=now(),updated_by=v_actor;

    if v_att_status in('absent','excused') then
      -- Only rebuild derived review plans when the absence actually removes a memorization assignment.
      v_need_review_sync:=exists(
        select 1 from public.plan_days pd join public.plans p on p.id=pd.plan_id
        where pd.student_id=v_student.id and pd.date_key=p_date
          and p.type='memorization' and p.status='active'
      );
      delete from public.outcomes where student_id=v_student.id and date_key=p_date;
      update public.plan_days pd set rating=null,notes=null,completed_amount=0,carry_out=0,status='planned',updated_at=now(),updated_by=v_actor
      where pd.student_id=v_student.id and pd.date_key=p_date
        and exists(select 1 from public.plans p where p.id=pd.plan_id and p.status='active' and p.type in('memorization','recent_review','review'));

      for v_plan_id in
        select distinct pd.plan_id from public.plan_days pd join public.plans p on p.id=pd.plan_id and p.status='active'
        where pd.student_id=v_student.id and pd.date_key=p_date and p.type in('memorization','review')
      loop
        perform public.exclude_plan_date(v_plan_id,p_date);
      end loop;
      if v_need_review_sync then perform private.sync_recent_review_for_student(v_student.id); end if;
      v_saved:=v_saved+1;
      continue;
    end if;

    v_need_review_sync:=false;
    v_lesson_text:=null;v_recent_review_text:=null;v_review_text:=null;v_review_rating:=null;
    v_review_seen:=false;v_review_worst:=0;v_any_carry:=false;v_has_plan:=false;

    for v_day in
      select pd.*,p.type,p.name,p.excluded_weekdays,p.excluded_dates
      from public.plan_days pd join public.plans p on p.id=pd.plan_id and p.status='active'
      where pd.student_id=v_student.id and pd.date_key=p_date and p.type in('memorization','recent_review','review')
      order by case p.type when 'memorization' then 1 when 'recent_review' then 2 else 3 end,p.created_at,p.id
      for update of pd
    loop
      v_has_plan:=true;
      if v_day.type='memorization' then
        v_track_rating:=v_mem_rating;
      elsif v_day.type='recent_review' then
        v_track_rating:=v_recent_rating;
      else
        v_track_rating:=nullif(btrim(coalesce(v_review_plan_ratings->>v_day.plan_id,'')),'');
        if v_track_rating is null and v_review_plan_ratings='{}'::jsonb then
          v_track_rating:=nullif(btrim(coalesce(v_ratings->>'review','')),'');
        end if;
      end if;

      if v_track_rating is null then
        raise exception 'اختر تقدير % للطالب %.',
          case v_day.type when 'memorization' then 'الحفظ الجديد' when 'recent_review' then 'المراجعة الصغرى' else coalesce(nullif(v_day.name,''),'إحدى المراجعات الكبرى') end,
          v_student.full_name;
      end if;
      if v_track_rating not in('ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع') then raise exception 'التقدير غير صالح للطالب %.',v_student.full_name; end if;

      v_effective_from:=coalesce(v_day.carry_from,v_day.target_from);
      v_due:=coalesce(v_day.target_amount,0)+coalesce(v_day.carry_in,0);

      update public.plan_days pd set
        rating=v_track_rating,notes=v_notes,
        completed_amount=case when v_track_rating in('ممتاز','جيد جدًا','جيد') then v_due else 0 end,
        carry_out=case when v_day.type<>'recent_review' and v_track_rating in('لم يحفظ','لم يسمع') then v_due else 0 end,
        status=case when v_track_rating in('ممتاز','جيد جدًا','جيد') then 'completed' when v_day.type='recent_review' then 'not_done' else 'carried' end,
        updated_at=now(),updated_by=v_actor
      where pd.id=v_day.id;

      if v_day.type='memorization' then
        -- Equivalent ratings do not change the effective memorized span.
        if v_day.rating is null or
           (v_day.rating in('ممتاز','جيد جدًا','جيد')) is distinct from
           (v_track_rating in('ممتاز','جيد جدًا','جيد')) then
          v_need_review_sync:=true;
        end if;
        v_lesson_text:=case when coalesce(v_day.carry_in,0)>0 then 'مرحّل: '||private.quran_ref_label(v_effective_from,v_day.target_to)||'؛ المقرر الأصلي: '||coalesce(private.quran_segments_label(v_day.segments),private.quran_ref_label(v_day.target_from,v_day.target_to)) else coalesce(private.quran_segments_label(v_day.segments),private.quran_ref_label(v_effective_from,v_day.target_to)) end;
      elsif v_day.type='recent_review' then
        v_recent_review_text:=case when coalesce(v_day.carry_in,0)>0 then 'مرحّل: '||private.quran_ref_label(v_effective_from,v_day.target_to)||'؛ المقرر الأصلي: '||coalesce(private.quran_segments_label(v_day.segments),private.quran_ref_label(v_day.target_from,v_day.target_to)) else coalesce(private.quran_segments_label(v_day.segments),private.quran_ref_label(v_effective_from,v_day.target_to)) end;
      else
        v_review_seen:=true;
        v_review_text:=concat_ws(' | ',v_review_text,coalesce(nullif(v_day.name,''),'المراجعة الكبرى')||': '||case when coalesce(v_day.carry_in,0)>0 then 'مرحّل: '||private.quran_ref_label(v_effective_from,v_day.target_to)||'؛ المقرر الأصلي: '||coalesce(private.quran_segments_label(v_day.segments),private.quran_ref_label(v_day.target_from,v_day.target_to)) else coalesce(private.quran_segments_label(v_day.segments),private.quran_ref_label(v_effective_from,v_day.target_to)) end);
        v_score:=case v_track_rating when 'ممتاز' then 1 when 'جيد جدًا' then 2 when 'جيد' then 3 when 'لم يحفظ' then 4 when 'لم يسمع' then 5 else 0 end;
        if v_score>v_review_worst then v_review_worst:=v_score;v_review_rating:=v_track_rating;end if;
      end if;

      if v_track_rating in('لم يحفظ','لم يسمع') and v_day.type<>'recent_review' then
        v_any_carry:=true;
        select pd.* into v_next from public.plan_days pd where pd.plan_id=v_day.plan_id and pd.date_key>p_date order by pd.date_key limit 1 for update;
        if not found then
          v_excluded:=coalesce(v_day.excluded_weekdays,'{}'::smallint[]);
          v_excluded_dates:=coalesce(v_day.excluded_dates,'{}'::date[]);
          v_candidate:=p_date;
          loop
            v_candidate:=v_candidate+1;
            exit when not(extract(dow from v_candidate)::smallint=any(v_excluded)) and not(v_candidate=any(v_excluded_dates));
          end loop;
          insert into public.plan_days(plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,target_from,target_to,target_amount,carry_in,carry_from,status,created_by,updated_by,cycle_no)
          values(v_day.plan_id,v_day.org_id,v_day.complex_id,v_day.circle_id,v_day.student_id,v_day.teacher_id,v_candidate,v_day.target_to,v_day.target_to,0,v_due,v_effective_from,'planned',v_actor,v_actor,v_day.cycle_no)
          returning * into v_next;
          update public.plans set end_date=greatest(end_date,v_candidate),updated_at=now(),updated_by=v_actor where id=v_day.plan_id;
        end if;
      end if;

      -- Only walk the carry chain when its rated state or amount changes.
      if v_day.type<>'recent_review' and (
        v_day.rating is distinct from v_track_rating or
        coalesce(v_day.completed_amount,0) is distinct from
          (case when v_track_rating in('ممتاز','جيد جدًا','جيد') then v_due else 0 end) or
        coalesce(v_day.carry_out,0) is distinct from
          (case when v_track_rating in('لم يحفظ','لم يسمع') then v_due else 0 end)
      ) then
        perform private.recalculate_plan_carry(v_day.plan_id);
      end if;
    end loop;

    if not v_has_plan then
      delete from public.outcomes where student_id=v_student.id and date_key=p_date;
      v_saved:=v_saved+1;continue;
    end if;

    insert into public.outcomes(
      org_id,complex_id,circle_id,student_id,teacher_id,date_key,new_lesson,recent_review,review,rating,
      memorization_rating,recent_review_rating,review_rating,carry_over,notes,recitation_metrics,created_by,updated_by
    ) values(
      v_student.org_id,v_student.complex_id,v_student.circle_id,v_student.id,v_teacher_id,p_date,
      v_lesson_text,v_recent_review_text,v_review_text,null,v_mem_rating,v_recent_rating,v_review_rating,
      v_any_carry,v_notes,v_metrics,v_actor,v_actor
    )
    on conflict(student_id,date_key) do update set
      teacher_id=excluded.teacher_id,new_lesson=excluded.new_lesson,recent_review=excluded.recent_review,review=excluded.review,
      rating=null,memorization_rating=excluded.memorization_rating,recent_review_rating=excluded.recent_review_rating,
      review_rating=excluded.review_rating,carry_over=excluded.carry_over,notes=excluded.notes,
      recitation_metrics=excluded.recitation_metrics,updated_at=now(),updated_by=v_actor;

    if v_need_review_sync then perform private.sync_recent_review_for_student(v_student.id); end if;
    v_saved:=v_saved+1;
  end loop;

  return jsonb_build_object('ok',true,'saved',v_saved);
end;
$function$;
