
-- Daily practice extensions are independent of the week-based curriculum pacing.
create table if not exists public.talaqqin_lesson_day_extensions (
  student_id text not null references public.students(id) on delete cascade,
  lesson_no integer not null references public.talaqqin_lessons(lesson_no),
  lesson_started_on date not null,
  added_days integer not null check(added_days between 1 and 3650),
  hold_until date not null,
  note text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key(student_id,lesson_no)
);
alter table public.talaqqin_lesson_day_extensions enable row level security;
revoke all on public.talaqqin_lesson_day_extensions from public,anon,authenticated;
create index if not exists talaqqin_lesson_day_extensions_until_idx
  on public.talaqqin_lesson_day_extensions(student_id,lesson_started_on,hold_until);



create or replace function public.extend_talaqqin_lesson_days(
  p_student_id text,p_lesson_no integer,p_add_days integer,p_note text default null
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_student public.students%rowtype;
  v_state public.talaqqin_student_state%rowtype;
  v_existing public.talaqqin_lesson_day_extensions%rowtype;
  v_today date:=(now() at time zone 'Asia/Riyadh')::date;
  v_until date;
  v_total integer;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم الدخول بحساب نشط.' using errcode='42501';
  end if;
  if p_add_days is null or p_add_days not between 0 and 7 then
    raise exception 'اختر مدة من يوم إلى سبعة أيام، أو صفرًا لإلغاء التمديد.' using errcode='22023';
  end if;
  select * into v_student from public.students where id=p_student_id and active for update;
  if not found then raise exception 'الطالب غير موجود أو غير نشط.'; end if;
  if not private.can_access(v_student.org_id,v_student.complex_id,v_student.circle_id,
    array['admin','manager','supervisor','teacher']::public.app_role[]) then
    raise exception 'ليس لديك صلاحية تعديل درس هذا الطالب.' using errcode='42501';
  end if;
  if not exists(select 1 from public.circles where id=v_student.circle_id and active and circle_type='حلقات التلقين') then
    raise exception 'الطالب ليس في حلقة تلقين نشطة.';
  end if;
  select * into v_state from public.talaqqin_student_state
  where student_id=p_student_id and active for update;
  if not found or not v_state.placement_set or v_state.completed
    or v_state.current_custom_lesson_id is not null or v_state.current_lesson_no<>p_lesson_no then
    raise exception 'يُسمح بالتمديد للدرس الأصلي الحالي فقط. حدِّث بيانات الطالب وأعد المحاولة.';
  end if;
  if not exists(select 1 from public.talaqqin_lessons where lesson_no=p_lesson_no and active) then
    raise exception 'الدرس غير موجود.';
  end if;
  select * into v_existing from public.talaqqin_lesson_day_extensions
  where student_id=p_student_id and lesson_no=p_lesson_no for update;
  if p_add_days=0 then
    delete from public.talaqqin_lesson_day_extensions
    where student_id=p_student_id and lesson_no=p_lesson_no;
    return jsonb_build_object('ok',true,'cancelled',true,'studentId',p_student_id,
      'lessonNo',p_lesson_no,'extraDays',0,'holdUntil',null);
  end if;
  if v_existing.student_id is not null
    and v_existing.lesson_started_on=v_state.lesson_started_on then
    v_until:=greatest(v_existing.hold_until,v_today)+p_add_days;
    v_total:=v_existing.added_days+p_add_days;
  else
    v_until:=v_today+p_add_days;
    v_total:=p_add_days;
  end if;
  if v_total>3650 then raise exception 'بلغت أيام التمديد الحد الأقصى لهذه الدورة. راجع خطة الطالب.'; end if;
  insert into public.talaqqin_lesson_day_extensions(
    student_id,lesson_no,lesson_started_on,added_days,hold_until,note,updated_by,updated_at
  ) values(
    p_student_id,p_lesson_no,v_state.lesson_started_on,v_total,
    v_until,nullif(trim(p_note),''),v_actor,now()
  ) on conflict(student_id,lesson_no) do update set
    lesson_started_on=excluded.lesson_started_on,added_days=excluded.added_days,
    hold_until=excluded.hold_until,note=excluded.note,
    updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('ok',true,'cancelled',false,'studentId',p_student_id,
    'lessonNo',p_lesson_no,'extraDays',v_total,'addedNow',p_add_days,'holdUntil',v_until);
end;
$function$;
revoke all on function public.extend_talaqqin_lesson_days(text,integer,integer,text) from public,anon;
grant execute on function public.extend_talaqqin_lesson_days(text,integer,integer,text) to authenticated;


CREATE OR REPLACE FUNCTION public.get_talaqqin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_out jsonb;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'studentId',s.id,
      'fullName',s.full_name,
      'circleId',c.id,
      'circleName',c.name,
      'teacherId',s.teacher_id,
      'teacherName',s.teacher_name,
      'completed',st.completed,
      'placementSet',st.placement_set,
      'placementNote',st.placement_note,
      'currentLessonNo',st.current_lesson_no,
      'lessonStartedOn',st.lesson_started_on,
      'planNote',st.plan_note,
      'lessonSource',case when cl.id is not null then 'custom' else 'curriculum' end,
      'lessonExtraWeeks',coalesce(lp.extra_weeks,0),
      'lessonDailyHoldUntil',(
        select x.hold_until from public.talaqqin_lesson_day_extensions x
        where x.student_id=s.id and x.lesson_no=st.current_lesson_no
          and x.lesson_started_on=st.lesson_started_on
      ),
      'lessonDailyExtraDays',coalesce((
        select x.added_days from public.talaqqin_lesson_day_extensions x
        where x.student_id=s.id and x.lesson_no=st.current_lesson_no
          and x.lesson_started_on=st.lesson_started_on
      ),0),
      'lessonExtensionNote',lp.note,
      'lesson',case
        when not st.placement_set then null
        when cl.id is not null then jsonb_build_object(
          'customLessonId',cl.id,'lessonNo',st.current_lesson_no,
          'unitNo',l.unit_no,'unitName',l.unit_name,
          'weekStart',l.unit_week_start,'weekEnd',l.unit_week_end,
          'title',cl.title,'skill',cl.skill,
          'pageFrom',cl.book_page_from,'pageTo',cl.book_page_to,
          'mediaUrl',cl.media_url,'mediaLabel','مادة مساعدة للدرس الخاص',
          'plannedWeeks',cl.planned_weeks,'notes',cl.notes,
          'afterPassAction',cl.after_pass_action,'isCustom',true
        )
        when l.lesson_no is not null then jsonb_build_object(
          'lessonNo',l.lesson_no,'unitNo',l.unit_no,'unitName',l.unit_name,
          'weekStart',l.unit_week_start,'weekEnd',l.unit_week_end,
          'title',l.lesson_title,'skill',l.skill,
          'pageFrom',l.book_page_from,'pageTo',l.book_page_to,
          'mediaUrl',l.media_url,'mediaLabel',l.media_label,
          'extraWeeks',coalesce(lp.extra_weeks,0),'extensionNote',lp.note,
          'isCustom',false
        )
        else null
      end,
      'completedLessons',(
        select count(distinct a.lesson_no)
        from public.talaqqin_assessments a
        where a.student_id=s.id and a.passed and a.custom_lesson_id is null
      ),
      'pacing',(
        select jsonb_build_object(
          'totalWeeks',
            sum(coalesce(p.planned_weeks,u.baseline_weeks))
            + coalesce((select sum(x.extra_weeks) from public.talaqqin_student_lesson_pacing x where x.student_id=s.id),0),
          'unitWeeks',sum(coalesce(p.planned_weeks,u.baseline_weeks)),
          'extraLessonWeeks',coalesce((select sum(x.extra_weeks) from public.talaqqin_student_lesson_pacing x where x.student_id=s.id),0),
          'units',jsonb_agg(jsonb_build_object(
            'unitNo',u.unit_no,'unitName',u.unit_name,
            'baselineWeeks',u.baseline_weeks,
            'plannedWeeks',coalesce(p.planned_weeks,u.baseline_weeks),
            'note',p.note
          ) order by u.unit_no)
        )
        from (
          select unit_no,min(unit_name) unit_name,
                 max(unit_week_end)-min(unit_week_start)+1 baseline_weeks
          from public.talaqqin_lessons
          where active
          group by unit_no
        ) u
        left join public.talaqqin_student_unit_pacing p
          on p.student_id=s.id and p.unit_no=u.unit_no
      ),
      'activeCustomLesson',case when cl.id is null then null else jsonb_build_object(
        'id',cl.id,'title',cl.title,'plannedWeeks',cl.planned_weeks,
        'notes',cl.notes,'afterPassAction',cl.after_pass_action
      ) end,
      'lastAssessment',(
        select jsonb_build_object(
          'lessonNo',a.lesson_no,'customLessonId',a.custom_lesson_id,
          'rating',a.rating,'passed',a.passed,
          'assessedOn',a.assessed_on,'notes',a.notes
        )
        from public.talaqqin_assessments a
        where a.student_id=s.id
        order by a.created_at desc limit 1
      )
    )
    order by c.name,s.full_name
  ),'[]'::jsonb)
  into v_out
  from public.students s
  join public.circles c on c.id=s.circle_id and c.active and c.circle_type='حلقات التلقين'
  join public.talaqqin_student_state st on st.student_id=s.id and st.active
  left join public.talaqqin_lessons l on l.lesson_no=st.current_lesson_no and l.active
  left join public.talaqqin_custom_lessons cl on cl.id=st.current_custom_lesson_id and cl.status='active'
  left join public.talaqqin_student_lesson_pacing lp on lp.student_id=s.id and lp.lesson_no=st.current_lesson_no
  where s.active
    and private.can_access(
      s.org_id,s.complex_id,s.circle_id,
      array['admin','manager','supervisor','teacher']::public.app_role[]
    );

  return v_out;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_talaqqin_assessment(p_student_id text, p_rating text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  s public.students%rowtype;
  st public.talaqqin_student_state%rowtype;
  c public.circles%rowtype;
  l public.talaqqin_lessons%rowtype;
  cl public.talaqqin_custom_lessons%rowtype;
  v_passed boolean;
  v_next integer;
  v_is_custom boolean:=false;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;
  if p_rating not in('ممتاز','جيد جدًا','جيد','يحتاج إعادة','لم يتقن','لم يسمع') then
    raise exception 'التقدير غير معتمد.';
  end if;

  select * into s from public.students where id=p_student_id and active for update;
  if not found then raise exception 'الطالب غير موجود أو غير نشط.'; end if;
  select * into c from public.circles where id=s.circle_id and active;
  if not found or c.circle_type<>'حلقات التلقين' then raise exception 'الطالب ليس مسندًا إلى حلقة تلقين.'; end if;
  if not private.can_access(s.org_id,s.complex_id,s.circle_id,array['admin','manager','supervisor','teacher']::public.app_role[]) then
    raise exception 'لا تملك صلاحية تقييم هذا الطالب.' using errcode='42501';
  end if;

  select * into st from public.talaqqin_student_state where student_id=s.id and active for update;
  if not found or not st.placement_set then raise exception 'حدد موضع بداية الطالب أولًا.'; end if;
  if st.completed then raise exception 'الطالب أنهى منهج حلقات التلقين.'; end if;
  select * into l from public.talaqqin_lessons where lesson_no=st.current_lesson_no and active;
  if not found then raise exception 'تعذر العثور على الدرس الحالي.'; end if;

  if st.current_custom_lesson_id is not null then
    select * into cl from public.talaqqin_custom_lessons
    where id=st.current_custom_lesson_id and status='active';
    if found then v_is_custom:=true; end if;
  end if;

  v_passed:=p_rating in('ممتاز','جيد جدًا','جيد');

  insert into public.talaqqin_assessments(
    student_id,org_id,complex_id,circle_id,lesson_no,custom_lesson_id,rating,passed,notes,actor_uid
  ) values(
    s.id,s.org_id,s.complex_id,s.circle_id,l.lesson_no,
    case when v_is_custom then cl.id else null end,
    p_rating,v_passed,nullif(trim(p_notes),''),v_actor
  );

  if v_passed and v_is_custom then
    update public.talaqqin_custom_lessons
    set status='completed',completed_at=now()
    where id=cl.id;

    if cl.after_pass_action='advance' then
      select min(lesson_no) into v_next from public.talaqqin_lessons where active and lesson_no>l.lesson_no;
      if v_next is null then
        update public.talaqqin_student_state
        set current_custom_lesson_id=null,completed=true,completed_at=now(),
            updated_at=now(),updated_by=v_actor
        where student_id=s.id;
      else
        update public.talaqqin_student_state
        set current_custom_lesson_id=null,current_lesson_no=v_next,completed=false,completed_at=null,
            lesson_started_on=(now() at time zone 'Asia/Riyadh')::date,updated_at=now(),updated_by=v_actor
        where student_id=s.id;
      end if;
    else
      update public.talaqqin_student_state
      set current_custom_lesson_id=null,lesson_started_on=(now() at time zone 'Asia/Riyadh')::date,
          updated_at=now(),updated_by=v_actor
      where student_id=s.id;
    end if;

  elsif v_passed then
    -- A mastery rating is recorded, but the course does not advance before the
    -- additional practice days end. The teacher may extend again in 1–7 day steps.
    if exists (
      select 1 from public.talaqqin_lesson_day_extensions e
      where e.student_id=s.id and e.lesson_no=l.lesson_no
        and e.lesson_started_on=st.lesson_started_on
        and e.hold_until>(now() at time zone 'Asia/Riyadh')::date
    ) then
      update public.talaqqin_student_state
      set updated_at=now(),updated_by=v_actor where student_id=s.id;
    else
      select min(lesson_no) into v_next from public.talaqqin_lessons where active and lesson_no>l.lesson_no;
      if v_next is null then
        update public.talaqqin_student_state
        set completed=true,completed_at=now(),updated_at=now(),updated_by=v_actor
        where student_id=s.id;
      else
        update public.talaqqin_student_state
        set current_lesson_no=v_next,completed=false,completed_at=null,
            lesson_started_on=(now() at time zone 'Asia/Riyadh')::date,updated_at=now(),updated_by=v_actor
        where student_id=s.id;
      end if;
    end if;
  else
    update public.talaqqin_student_state
    set updated_at=now(),updated_by=v_actor
    where student_id=s.id;
  end if;

  select * into st from public.talaqqin_student_state where student_id=s.id;
  return jsonb_build_object(
    'ok',true,'studentId',s.id,'passed',v_passed,'wasCustom',v_is_custom,
    'assessedLessonNo',l.lesson_no,'rating',p_rating,
    'completed',st.completed,'currentLessonNo',st.current_lesson_no,
    'customLessonId',st.current_custom_lesson_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_talaqqin_assessment_guarded(p_assessment_id uuid, p_rating text, p_notes text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_student_id text;
  v_student public.students%rowtype;
  v_assessment public.talaqqin_assessments%rowtype;
  v_state public.talaqqin_student_state%rowtype;
  v_new_passed boolean;
  v_next integer;
  v_has_later boolean;
  v_progress text := 'unchanged';
  v_notes text := nullif(trim(p_notes),'');
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم الدخول بحساب نشط.' using errcode='42501';
  end if;
  if p_rating not in('ممتاز','جيد جدًا','جيد','يحتاج إعادة','لم يتقن','لم يسمع') then
    raise exception 'التقدير غير معتمد.';
  end if;
  select student_id into v_student_id from public.talaqqin_assessments where id=p_assessment_id;
  if v_student_id is null then raise exception 'لم يُعثر على الحصيلة المطلوب تعديلها.'; end if;
  select * into v_student from public.students where id=v_student_id and active for update;
  if not found then raise exception 'الطالب غير نشط أو غير موجود.'; end if;
  if not private.can_access(v_student.org_id,v_student.complex_id,v_student.circle_id,
    array['admin','manager','supervisor','teacher']::public.app_role[]) then
    raise exception 'ليس لديك صلاحية تعديل حصيلة هذا الطالب.' using errcode='42501';
  end if;
  if not exists(select 1 from public.circles c
    where c.id=v_student.circle_id and c.active and c.circle_type='حلقات التلقين') then
    raise exception 'الطالب ليس في حلقة تلقين نشطة.';
  end if;
  select * into v_assessment from public.talaqqin_assessments
    where id=p_assessment_id and student_id=v_student_id for update;
  if not found then raise exception 'سجل الحصيلة غير متاح.'; end if;
  -- Prevent one teacher from accidentally overwriting a concurrent correction.
  if p_expected_updated_at is not null
     and v_assessment.updated_at is distinct from p_expected_updated_at then
    raise exception 'تم تعديل الحصيلة من جهاز آخر؛ حدِّث السجل وراجع التقدير قبل حفظه مجددًا.';
  end if;
  v_new_passed := p_rating in ('ممتاز','جيد جدًا','جيد');
  if v_assessment.rating is not distinct from p_rating
     and v_assessment.notes is not distinct from v_notes then
    return jsonb_build_object('ok',true,'updated',false,'assessmentId',v_assessment.id,
      'rating',v_assessment.rating,'assessedOn',v_assessment.assessed_on,
      'updatedAt',v_assessment.updated_at,'progressAction','unchanged');
  end if;

  select exists(
    select 1 from public.talaqqin_assessments next_a
    where next_a.student_id=v_student_id
      and (next_a.created_at,next_a.id)>(v_assessment.created_at,v_assessment.id)
  ) into v_has_later;
  select * into v_state from public.talaqqin_student_state
    where student_id=v_student_id and active for update;

  if v_assessment.passed is distinct from v_new_passed then
    if v_assessment.custom_lesson_id is not null or v_has_later then
      -- Do not silently undo newer lessons or resurrect completed custom lessons.
      v_progress := 'preserved';
    elsif found and v_state.placement_set then
      select min(lesson_no) into v_next from public.talaqqin_lessons
      where active and lesson_no>v_assessment.lesson_no;
      if v_assessment.passed and not v_new_passed
         and v_state.current_custom_lesson_id is null
         and ((v_next is null and v_state.completed and v_state.current_lesson_no=v_assessment.lesson_no)
           or (v_next is not null and not v_state.completed and v_state.current_lesson_no=v_next)) then
        update public.talaqqin_student_state
          set current_lesson_no=v_assessment.lesson_no,completed=false,completed_at=null,
              lesson_started_on=(timezone('Asia/Riyadh',now()))::date,
              updated_at=now(),updated_by=v_actor
          where student_id=v_student_id;
        v_progress := 'reverted';
      elsif not v_assessment.passed and v_new_passed
         and not v_state.completed and v_state.current_custom_lesson_id is null
         and v_state.current_lesson_no=v_assessment.lesson_no
         and not exists(
           select 1 from public.talaqqin_lesson_day_extensions e
           where e.student_id=v_student_id and e.lesson_no=v_assessment.lesson_no
            and e.lesson_started_on=v_state.lesson_started_on
            and e.hold_until>(now() at time zone 'Asia/Riyadh')::date
         ) then
        update public.talaqqin_student_state
          set current_lesson_no=coalesce(v_next,v_assessment.lesson_no),
              completed=(v_next is null),
              completed_at=case when v_next is null then now() else null end,
              lesson_started_on=(timezone('Asia/Riyadh',now()))::date,
              updated_at=now(),updated_by=v_actor
          where student_id=v_student_id;
        v_progress := 'advanced';
      else
        v_progress := 'preserved';
      end if;
    else
      v_progress := 'preserved';
    end if;
  end if;

  update public.talaqqin_assessments
    set rating=p_rating,passed=v_new_passed,notes=v_notes,updated_at=now(),updated_by=v_actor
    where id=v_assessment.id;

  insert into private.talaqqin_assessment_edit_audit(
    assessment_id,student_id,lesson_no,assessed_on,old_rating,new_rating,
    old_notes,new_notes,old_passed,new_passed,progress_action,actor_uid
  ) values (
    v_assessment.id,v_student_id,v_assessment.lesson_no,v_assessment.assessed_on,
    v_assessment.rating,p_rating,v_assessment.notes,v_notes,
    v_assessment.passed,v_new_passed,v_progress,v_actor
  );
  return jsonb_build_object('ok',true,'updated',true,'assessmentId',v_assessment.id,
    'rating',p_rating,'assessedOn',v_assessment.assessed_on,
    'updatedAt',(select updated_at from public.talaqqin_assessments where id=v_assessment.id),
    'progressAction',v_progress);
end;
$function$
;