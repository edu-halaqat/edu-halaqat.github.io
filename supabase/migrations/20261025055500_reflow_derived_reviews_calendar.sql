-- Derived reviews must not recreate a lesson on an officially excluded
-- date; this also resolves existing queue failures after review rebuild.
DO $fix$
DECLARE f text;old text;neu text;
BEGIN
 f:=pg_get_functiondef('private.rebuild_recent_review_plan(text)'::regprocedure);
 old:='     and pd.target_to is not null'||chr(10)||'   order by pd.date_key';
 neu:='     and pd.target_to is not null'||chr(10)||
     '     and private.effective_day_type(v_plan.student_id,pd.date_key)=''study'''||chr(10)||
     '   order by pd.date_key';
 IF position(neu in f)=0 THEN
   IF position(old in f)=0 THEN RAISE EXCEPTION 'موضع المراجعة الصغرى تغير.';END IF;
   EXECUTE replace(f,old,neu);
 END IF;
 f:=pg_get_functiondef('private.rebuild_qpc_major_review_against_recent(text)'::regprocedure);
 old:='      and not(d::date=any(coalesce(v_plan.excluded_dates,''{}''::date[])))';
 neu:=old||chr(10)||
      '      and private.effective_day_type(v_plan.student_id,d::date)=''study''';
 IF position(neu in f)=0 THEN
   IF position(old in f)=0 THEN RAISE EXCEPTION 'موضع المراجعة الكبرى تغير.';END IF;
   EXECUTE replace(f,old,neu);
 END IF;
 f:=pg_get_functiondef('private.process_calendar_day_reflow(integer)'::regprocedure);
 old:='WHERE q.state=''pending'' ORDER BY q.created_at,q.circle_id,q.student_id';
 neu:='WHERE q.state=''pending'' ORDER BY q.date_key,q.created_at,q.circle_id,q.student_id';
 IF position(neu in f)=0 THEN
   IF position(old in f)=0 THEN RAISE EXCEPTION 'موضع ترتيب التسوية تغير.';END IF;
   EXECUTE replace(f,old,neu);
 END IF;
END $fix$;

-- Retry jobs whose earlier failures may have been caused by the derived
-- review regeneration. Do not touch completed jobs or student results.
UPDATE private.calendar_day_reflow_queue
SET state='pending',last_error=NULL,updated_at=now()
WHERE state='failed'
  AND last_error LIKE 'لم يكتمل استثناء يوم الطالب % من جميع الخطط%';
