-- Separate verified attendance from the teacher's educational session.
-- No changes to geofence, attendance rows, role grants, plans or outcomes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20000ms';
CREATE OR REPLACE FUNCTION public.circle_session_access(p_circle_id text, p_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_circle public.circles%rowtype;
  v_rule public.circle_session_rules%rowtype;
  v_local timestamp := timezone('Asia/Riyadh',now());
  v_today date := timezone('Asia/Riyadh',now())::date;
  v_manager boolean := false;
  v_day integer;
  v_allowed boolean := true;
  v_reason text := null;
  v_open_at timestamp;
  v_close_at timestamp;
  v_teacher_id text;
  v_attendance public.attendance%rowtype;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;

  select * into v_circle from public.circles where id=p_circle_id and active;
  if not found then raise exception 'الحلقة غير موجودة أو غير نشطة.'; end if;

  v_manager := private.can_access(
    v_circle.org_id,v_circle.complex_id,v_circle.id,
    array['admin','manager','supervisor']::public.app_role[]
  );

  if not v_manager then
    v_teacher_id := private.current_teacher_id_for_circle(
      v_circle.org_id,v_circle.complex_id,v_circle.id
    );
    if v_teacher_id is null then
      raise exception 'لا تملك صلاحية الوصول لهذه الحلقة أو لم يتم إسنادها لك.'
        using errcode='42501';
    end if;
  end if;

  perform private.ensure_circle_session_rule_row(p_circle_id);
  select * into v_rule from public.circle_session_rules where circle_id=p_circle_id;

  -- جميع الحلقات تفتح من نحو نصف ساعة قبل العصر بغض النظر عن فترة الحلقة.
  v_open_at := private.circle_session_open_at(p_circle_id,p_date);
  v_close_at := p_date::timestamp + time '23:30';

  if v_manager then
    return jsonb_build_object(
      'allowed',true,'managerOverride',true,'rule',to_jsonb(v_rule),
      'today',v_today,'now',v_local,'opensAt',v_open_at,'closesAt',v_close_at,
      'universalOpen',true
    );
  end if;

  v_day := extract(dow from p_date)::integer;
  if not (v_day=any(v_rule.weekdays::integer[])) then
    v_allowed:=false; v_reason:='هذا اليوم ليس من أيام دوام الحلقة.';
  end if;

  if v_allowed and p_date>v_today then
    v_allowed:=false; v_reason:='لا يمكن فتح حصيلة تاريخ مستقبلي.';
  end if;

  if v_allowed and p_date<v_today then
    if not v_rule.allow_previous_day_edit then
      v_allowed:=false; v_reason:='المشرف لم يُتح تعديل حصيلة يوم سابق.';
    elsif (v_today-p_date)>v_rule.previous_edit_days then
      v_allowed:=false; v_reason:='انتهت مدة السماح بتعديل الحصيلة السابقة.';
    end if;
  end if;

  if v_allowed and p_date=v_today and not v_rule.allow_outside_hours
     and not (v_local between v_open_at and v_close_at) then
    v_allowed:=false;
    v_reason:='جلسة الحلقة متاحة من '||to_char(v_open_at,'HH24:MI')||' إلى 23:30 لجميع الحلقات.';
  end if;

  if v_allowed and p_date=v_today then
    select * into v_attendance
    from public.attendance a
    where a.user_id=v_actor
      and a.teacher_id=v_teacher_id
      and a.date_key=p_date
    limit 1;

    -- Missing biometric attendance is not permission to record a check-in,
    -- and is not a blocker for the teacher's curriculum work.
    if v_attendance.check_out_at is not null then
      v_allowed:=false;
      v_reason:='تم تسجيل الانصراف؛ لا يمكن بدء جلسة جديدة بعد الانصراف.';
    end if;
  end if;

  return jsonb_build_object(
    'allowed',v_allowed,'managerOverride',false,'reason',v_reason,
    'rule',to_jsonb(v_rule),'today',v_today,'now',v_local,
    'teacherId',v_teacher_id,'attendanceId',v_attendance.id,
    'attendanceStatus',v_attendance.status,
    'fingerprintPending',(p_date=v_today and v_attendance.check_in_at is null),
    'fingerprintNotice',case when p_date=v_today and v_attendance.check_in_at is null
      then 'لم تُعتمد بصمة حضور؛ يمكنك متابعة الحصيلة دون احتساب حضور.'
      else null end,
    'opensAt',v_open_at,'closesAt',v_close_at,'universalOpen',true
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.assert_circle_session_allowed(p_circle_id text, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  c public.circles%rowtype;
  r public.circle_session_rules%rowtype;
  v_now timestamp := timezone('Asia/Riyadh',now());
  v_today date := timezone('Asia/Riyadh',now())::date;
  v_dow smallint;
  v_open_at timestamp;
  v_close_at timestamp;
  v_teacher_id text;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;

  select * into c from public.circles where id=p_circle_id and active;
  if not found then raise exception 'الحلقة غير موجودة أو غير نشطة.'; end if;

  if private.can_access(
    c.org_id,c.complex_id,c.id,
    array['admin','manager','supervisor']::public.app_role[]
  ) then
    return;
  end if;

  v_teacher_id := private.current_teacher_id_for_circle(c.org_id,c.complex_id,c.id);
  if v_teacher_id is null then
    raise exception 'لا تملك صلاحية فتح جلسة هذه الحلقة أو لم يتم إسنادها لك.'
      using errcode='42501';
  end if;

  perform private.ensure_circle_session_rule_row(c.id);
  select * into r from public.circle_session_rules where circle_id=c.id;
  if not found then raise exception 'لم تُضبط أوقات جلسة الحلقة بعد؛ راجع المشرف.'; end if;

  if p_date is null then raise exception 'التاريخ مطلوب.'; end if;
  if p_date > v_today then raise exception 'لا يمكن تحرير حصيلة تاريخ مستقبلي.'; end if;

  v_dow := extract(dow from p_date)::smallint;
  if not (v_dow = any(r.weekdays)) then
    raise exception 'هذا اليوم ليس من أيام دوام الحلقة.';
  end if;

  if p_date < v_today then
    if not r.allow_previous_day_edit then
      raise exception 'المشرف لم يُتح تعديل حصيلة يوم سابق.';
    end if;
    if (v_today-p_date) > r.previous_edit_days then
      raise exception 'انتهت مدة السماح بتعديل الحصيلة السابقة.';
    end if;
    return;
  end if;

  v_open_at := private.circle_session_open_at(c.id,p_date);
  v_close_at := p_date::timestamp + time '23:30';

  if not r.allow_outside_hours and not (v_now between v_open_at and v_close_at) then
    raise exception 'جلسة الحلقة متاحة من % إلى 23:30 فقط لجميع الحلقات.',
      to_char(v_open_at,'HH24:MI');
  end if;

  -- Teacher may complete the lesson when biometric check-in failed.
  -- This does not create any attendance record or modify geofence policies.
  if exists (
    select 1
    from public.attendance a
    where a.user_id=v_actor
      and a.teacher_id=v_teacher_id
      and a.date_key=p_date
      and a.check_out_at is not null
  ) then
    raise exception 'تم تسجيل الانصراف؛ لا يمكن اعتماد حصيلة جديدة بعد الانصراف.'
      using errcode='42501';
  end if;
end
$function$;

COMMIT;
