-- Instant calendar classification + durable reflow. 25 Oct 2026.
-- The time-critical approval does NOT iterate through plan_days.
CREATE TABLE IF NOT EXISTS private.calendar_day_reflow_queue(
 circle_id text NOT NULL, date_key date NOT NULL, student_id text NOT NULL,
 day_type text NOT NULL CHECK(day_type IN('holiday','unaccounted','test')),
 approved_by uuid NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','done','failed')),
 attempts integer NOT NULL DEFAULT 0,
 moved_plans integer NOT NULL DEFAULT 0,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(circle_id,date_key,student_id)
);
CREATE INDEX IF NOT EXISTS calendar_day_reflow_pending_idx
 ON private.calendar_day_reflow_queue(state,created_at) WHERE state='pending';
REVOKE ALL ON private.calendar_day_reflow_queue FROM PUBLIC,anon,authenticated;

-- Guard against false rollback when an archived plan has a day on the date.
DO $patch$
DECLARE def text; original text; revised text;
BEGIN
 def:=pg_get_functiondef('private.apply_nonstudy_to_student(text,date,text)'::regprocedure);
 original:='if exists('||chr(10)||'   select 1 from public.plan_days where student_id=p_student_id and date_key=p_date'||chr(10)||' ) then';
 revised:='if exists('||chr(10)||
   '   select 1 from public.plan_days pd join public.plans p on p.id=pd.plan_id and p.status=''active'''||chr(10)||
   '   where pd.student_id=p_student_id and pd.date_key=p_date'||chr(10)||' ) then';
 IF position(revised in def)=0 THEN
   IF position(original in def)=0 THEN
     RAISE EXCEPTION 'تعذر التحقق من دالة استثناء الخطط: لا يُنشر تعديل جزئي.';
   END IF;
   EXECUTE replace(def,original,revised);
 END IF;
END $patch$;

-- Do not show stale planned lessons on a holiday before the queue reflows them.
-- This does not affect historical ratings, outcomes or authentication.
DO $hide$
DECLARE function_name text; def text; changed text; code text; target text;
BEGIN
 FOREACH function_name IN ARRAY ARRAY['get_daily_assignments(text,date)',
                                  'get_student_daily_assignment_guarded(text,date)'] LOOP
   def:=pg_get_functiondef(('public.'||function_name)::regprocedure);
   changed:=def;
   code:='left join public.plan_days md on md.plan_id=mp.id and md.date_key=p_date';
   target:=code||chr(10)||'    and private.effective_day_type(s.id,p_date)=''study''';
   IF position(target in changed)=0 THEN
     IF position(code in changed)=0 THEN RAISE EXCEPTION 'تعذر فحص قراءة الحفظ: %',function_name;END IF;
     changed:=replace(changed,code,target);
   END IF;
   code:='left join public.plan_days sd on sd.plan_id=sp.id and sd.date_key=p_date';
   target:=code||chr(10)||'    and private.effective_day_type(s.id,p_date)=''study''';
   IF position(target in changed)=0 THEN
     IF position(code in changed)=0 THEN RAISE EXCEPTION 'تعذر فحص قراءة المراجعة الصغرى: %',function_name;END IF;
     changed:=replace(changed,code,target);
   END IF;
   code:='and p.start_date<=p_date and p.end_date>=p_date'||chr(10)||
         '  ) rv on true';
   target:='and p.start_date<=p_date and p.end_date>=p_date'||chr(10)||
      '      and private.effective_day_type(s.id,p_date)=''study'''||chr(10)||'  ) rv on true';
   IF position(target in changed)=0 THEN
     IF position(code in changed)=0 THEN RAISE EXCEPTION 'تعذر فحص قراءة الكبرى: %',function_name;END IF;
     changed:=replace(changed,code,target);
   END IF;
   IF changed<>def THEN EXECUTE changed; END IF;
 END LOOP;
END $hide$;

CREATE OR REPLACE FUNCTION public.approve_calendar_day_fast_guarded(
 p_circle_ids text[],p_date date,p_day_type text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '10s'
AS $fn$
DECLARE
 actor uuid:=(select auth.uid());cid text;circle_row public.circles%rowtype;
 count_c integer;created integer:=0;task_count integer:=0;prior text;
BEGIN
 IF actor IS NULL OR NOT private.active_user() THEN
   RAISE EXCEPTION 'يلزم حساب مخوّل ونشط.' USING errcode='42501';
 END IF;
 count_c:=cardinality(p_circle_ids);
 IF p_date IS NULL OR count_c IS NULL OR count_c<1 OR count_c>40 OR
    (select count(distinct x) from unnest(p_circle_ids) x where x IS NOT NULL)<>count_c OR
    p_day_type NOT IN('holiday','unaccounted','test','study') THEN
   RAISE EXCEPTION 'اختر تاريخًا وتصنيفًا صالحين ومن ١ إلى ٤٠ حلقة دون تكرار.' USING errcode='22023';
 END IF;
 -- Deterministic lock order guards against concurrent changes per circle.
 FOR cid IN SELECT unnest(p_circle_ids) ORDER BY 1 LOOP
   SELECT * INTO circle_row FROM public.circles WHERE id=cid AND active;
   IF NOT FOUND OR NOT private.can_access(circle_row.org_id,circle_row.complex_id,cid,
       array['admin','manager','supervisor']::public.app_role[]) THEN
     RAISE EXCEPTION 'لا تملك صلاحية أحد المجمعات أو الحلقات المحددة.' USING errcode='42501';
   END IF;
   PERFORM pg_advisory_xact_lock(hashtext(cid),p_date-date '2000-01-01');
   prior:=coalesce((select day_type from public.circle_day_types
     where circle_id=cid and date_key=p_date),'study');
   IF prior NOT IN('study',p_day_type) THEN
     RAISE EXCEPTION 'هذا التاريخ له تصنيف مختلف في الحلقة %؛ لا يُلغى ترحيل سابق تلقائيًا.',
       circle_row.name USING errcode='23514';
   END IF;
   IF prior<>p_day_type THEN
     IF EXISTS(SELECT 1 FROM public.students s
       WHERE s.circle_id=cid AND s.active AND (
         EXISTS(SELECT 1 FROM public.outcomes o WHERE o.student_id=s.id AND o.date_key=p_date) OR
         EXISTS(SELECT 1 FROM public.student_attendance a WHERE a.student_id=s.id AND a.date_key=p_date) OR
         EXISTS(SELECT 1 FROM public.talaqqin_assessments t WHERE t.student_id=s.id AND t.assessed_on=p_date) OR
         EXISTS(SELECT 1 FROM public.plan_days d WHERE d.student_id=s.id AND d.date_key=p_date
           AND (d.rating IS NOT NULL OR coalesce(d.completed_amount,0)>0))
       )
     ) THEN
       RAISE EXCEPTION 'توجد حصيلة أو بصمة أو مقررات منجزة في الحلقة % بتاريخ %؛ يلزم مراجعتها قبل تحويل اليوم إلى إجازة.',
         circle_row.name,p_date USING errcode='23514';
     END IF;
     INSERT INTO public.circle_day_types(circle_id,date_key,day_type,updated_by)
     VALUES(cid,p_date,p_day_type,actor)
     ON CONFLICT(circle_id,date_key) DO UPDATE SET day_type=excluded.day_type,
       updated_by=actor,updated_at=now();
     INSERT INTO public.day_type_audit(circle_id,student_id,date_key,before_type,after_type,actor_id)
     VALUES(cid,NULL,p_date,prior,p_day_type,actor);
     created:=created+1;
   END IF;
   IF p_day_type<>'study' THEN
     INSERT INTO private.calendar_day_reflow_queue(circle_id,date_key,student_id,day_type,approved_by,state)
     SELECT cid,p_date,s.id,p_day_type,actor,'pending'
     FROM public.students s
     WHERE s.circle_id=cid AND s.active
       AND private.effective_day_type(s.id,p_date)<>'study'
       AND EXISTS(
         SELECT 1 FROM public.plan_days d JOIN public.plans p
           ON p.id=d.plan_id AND p.status='active'
         WHERE d.student_id=s.id AND d.date_key=p_date
       )
     ON CONFLICT(circle_id,date_key,student_id) DO UPDATE
       SET day_type=excluded.day_type,approved_by=excluded.approved_by,
           state='pending',last_error=NULL,updated_at=now()
       WHERE private.calendar_day_reflow_queue.state<>'pending';
     GET DIAGNOSTICS count_c=ROW_COUNT;
     task_count:=task_count+count_c;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'approvedCircles',cardinality(p_circle_ids),
   'newClassifications',created,'queuedStudents',task_count,
   'scheduleStatus',CASE WHEN task_count>0 THEN 'pending' ELSE 'complete' END);
END;
$fn$;
REVOKE ALL ON FUNCTION public.approve_calendar_day_fast_guarded(text[],date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_calendar_day_fast_guarded(text[],date,text) TO authenticated;

-- The queue is a trusted record of actions authorized by a real manager.
-- The worker is private and can only be invoked by the DB's scheduled owner.
CREATE OR REPLACE FUNCTION private.process_calendar_day_reflow(p_limit integer DEFAULT 4)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '50s'
AS $fn$
DECLARE
 task record;handled integer:=0;failed integer:=0;
 previous_sub text;previous_role text;err text;affected integer;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 6 THEN
   RAISE EXCEPTION 'يُسمح بست تسويات كحد أقصى في الدفعة.' USING errcode='22023';
 END IF;
 previous_sub:=current_setting('request.jwt.claim.sub',true);
 previous_role:=current_setting('request.jwt.claim.role',true);
 FOR task IN
  SELECT q.* FROM private.calendar_day_reflow_queue q
  WHERE q.state='pending' ORDER BY q.created_at,q.circle_id,q.student_id
  LIMIT p_limit FOR UPDATE SKIP LOCKED
 LOOP
  affected:=0;
  BEGIN
   -- Backend-only delegated context for the manager whose authorized action
   -- created this job. This private function is NOT executable via the Data API.
   PERFORM set_config('request.jwt.claim.sub',task.approved_by::text,true);
   PERFORM set_config('request.jwt.claim.role','authenticated',true);
   IF NOT private.active_user() THEN
     RAISE EXCEPTION 'الحساب الذي اعتمد الإجازة لم يعد نشطًا.';
   END IF;
   IF EXISTS(SELECT 1 FROM public.plan_days d
     JOIN public.plans p ON p.id=d.plan_id AND p.status='active'
     WHERE d.student_id=task.student_id AND d.date_key=task.date_key) THEN
     affected:=private.apply_nonstudy_to_student(task.student_id,task.date_key,task.day_type);
   END IF;
   UPDATE private.calendar_day_reflow_queue q SET state='done',attempts=attempts+1,
     moved_plans=affected,last_error=NULL,updated_at=now()
   WHERE q.circle_id=task.circle_id AND q.date_key=task.date_key AND q.student_id=task.student_id;
   handled:=handled+1;
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   UPDATE private.calendar_day_reflow_queue q SET state='failed',
     attempts=attempts+1,last_error=left(err,300),updated_at=now()
   WHERE q.circle_id=task.circle_id AND q.date_key=task.date_key AND q.student_id=task.student_id;
   failed:=failed+1;
  END;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  PERFORM set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
 END LOOP;
 RETURN jsonb_build_object('done',handled,'failed',failed);
END;
$fn$;
REVOKE ALL ON FUNCTION private.process_calendar_day_reflow(integer)
FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_calendar_reflow_status_guarded(
 p_circle_ids text[],p_date date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '7s'
AS $fn$
DECLARE cid text;r public.circles%rowtype;res jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.active_user()
 OR p_date IS NULL OR cardinality(p_circle_ids) NOT BETWEEN 1 AND 40 THEN
   RAISE EXCEPTION 'طلب متابعة التقويم غير مصرح به.' USING errcode='42501';
 END IF;
 FOR cid IN SELECT distinct unnest(p_circle_ids) LOOP
   SELECT * INTO r FROM public.circles WHERE id=cid AND active;
   IF NOT FOUND OR NOT private.can_access(r.org_id,r.complex_id,cid,
      array['admin','manager','supervisor']::public.app_role[]) THEN
     RAISE EXCEPTION 'لا تملك صلاحية إحدى الحلقات.' USING errcode='42501';
   END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'circleId',x.circle_id,'approved',x.approved,'pending',x.pending,
   'done',x.done,'failed',x.failed,'lastError',x.last_error)
   ORDER BY x.circle_id),'[]'::jsonb) INTO res
 FROM (
   SELECT c.id circle_id,
     EXISTS(SELECT 1 FROM public.circle_day_types t WHERE t.circle_id=c.id AND t.date_key=p_date) approved,
     (SELECT count(*) FROM private.calendar_day_reflow_queue q WHERE q.circle_id=c.id AND q.date_key=p_date AND q.state='pending') pending,
     (SELECT count(*) FROM private.calendar_day_reflow_queue q WHERE q.circle_id=c.id AND q.date_key=p_date AND q.state='done') done,
     (SELECT count(*) FROM private.calendar_day_reflow_queue q WHERE q.circle_id=c.id AND q.date_key=p_date AND q.state='failed') failed,
     (SELECT max(q.last_error) FROM private.calendar_day_reflow_queue q WHERE q.circle_id=c.id AND q.date_key=p_date AND q.state='failed') last_error
   FROM public.circles c WHERE c.id=ANY(p_circle_ids)
 ) x;
 RETURN res;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_calendar_reflow_status_guarded(text[],date)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_reflow_status_guarded(text[],date) TO authenticated;

DO $cron$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='sanabil-calendar-fast-reflow') THEN
   PERFORM cron.schedule('sanabil-calendar-fast-reflow','* * * * *',
     'SET statement_timeout=''50s''; SELECT private.process_calendar_day_reflow(4);');
 END IF;
END $cron$;
