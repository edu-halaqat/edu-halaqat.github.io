-- Only active curriculum may block or require movement. Archived grades
-- are historical records: never change them and never count them as today's task.
DO $patch$
DECLARE f text; prior text; current text;
BEGIN
 f:=pg_get_functiondef('public.approve_calendar_day_fast_guarded(text[],date,text)'::regprocedure);
 prior:='EXISTS(SELECT 1 FROM public.plan_days d WHERE d.student_id=s.id AND d.date_key=p_date'||chr(10)||
 '           AND (d.rating IS NOT NULL OR coalesce(d.completed_amount,0)>0))';
 current:='EXISTS(SELECT 1 FROM public.plan_days d JOIN public.plans p'||chr(10)||
 '           ON p.id=d.plan_id AND p.status=''active'''||chr(10)||
 '           WHERE d.student_id=s.id AND d.date_key=p_date'||chr(10)||
 '           AND (d.rating IS NOT NULL OR coalesce(d.completed_amount,0)>0))';
 IF position(current in f)=0 THEN
   IF position(prior in f)=0 THEN RAISE EXCEPTION 'إجراء اعتماد اليوم تغيّر؛ أوقف التحديث الآلي.';END IF;
   EXECUTE replace(f,prior,current);
 END IF;

 f:=pg_get_functiondef('private.apply_nonstudy_to_student(text,date,text)'::regprocedure);
 prior:='if exists(select 1 from public.plan_days pd where pd.student_id=p_student_id and pd.date_key=p_date'||chr(10)||
 '     and (pd.rating is not null or coalesce(pd.completed_amount,0)>0)) then';
 current:='if exists(select 1 from public.plan_days pd JOIN public.plans p'||chr(10)||
 '     ON p.id=pd.plan_id AND p.status=''active'''||chr(10)||
 '     where pd.student_id=p_student_id and pd.date_key=p_date'||chr(10)||
 '     and (pd.rating is not null or coalesce(pd.completed_amount,0)>0)) then';
 IF position(current in f)=0 THEN
   IF position(prior in f)=0 THEN RAISE EXCEPTION 'التحقق من الحصيلة النشطة تغيّر؛ أوقف التحديث الآلي.';END IF;
   EXECUTE replace(f,prior,current);
 END IF;
END $patch$;