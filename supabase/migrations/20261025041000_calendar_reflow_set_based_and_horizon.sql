-- Prevent future horizon maintenance from reintroducing school-holiday lessons.
DO $patch$
DECLARE sig text; definition text; original text; revised text;student_expr text;
BEGIN
 FOREACH sig IN ARRAY ARRAY[
  'private.horizon_append_linear(text,date)',
  'private.horizon_append_qpc(text,date)',
  'private.horizon_append_memorization(text,date)',
  'private.horizon_append_recent(text,text,date)',
  'private.sync_recent_review_plan(text,text,date)'
 ] LOOP
   definition:=pg_get_functiondef(sig::regprocedure);
   IF sig LIKE '%append_linear%' OR sig LIKE '%append_qpc%' THEN
     original:='and not(d::date=any(coalesce(v_plan.excluded_dates,''{}''::date[])))';
     revised:=original||chr(10)||'      and private.effective_day_type(v_plan.student_id,d::date)=''study''';
   ELSIF sig LIKE '%append_memorization%' THEN
     original:='AND NOT(g::date=any(coalesce(p.excluded_dates,''{}''::date[])))';
     revised:=original||chr(10)||'     AND private.effective_day_type(p.student_id,g::date)=''study''';
   ELSIF sig LIKE '%append_recent%' THEN
     original:='AND (last_date IS NULL OR date_key>last_date) ORDER BY date_key';
     revised:='AND (last_date IS NULL OR date_key>last_date)'||chr(10)||
       '   AND private.effective_day_type(p.student_id,date_key)=''study'' ORDER BY date_key';
   ELSE
     original:='and d.date_key between v_recent.start_date and v_recent.end_date';
     revised:=original||chr(10)||
       '      and private.effective_day_type(v_mem.student_id,d.date_key)=''study''';
   END IF;
   IF position(revised in definition)=0 THEN
     IF position(original in definition)=0 THEN
       RAISE EXCEPTION 'تعذر تحديد مولد الخطة الذي يحتاج التصحيح: %',sig;
     END IF;
     EXECUTE replace(definition,original,revised);
   END IF;
 END LOOP;
END $patch$;

-- Replace the per-day O(n^2) mapping loop with one set-based scheduling pass.
-- Days and target ranges retain original sequence; historical results are protected
-- by the preexisting invariants in exclude_plan_date.
DO $optimize$
DECLARE definition text;original text;revised text;
BEGIN
 definition:=pg_get_functiondef('public.exclude_plan_date(text,date)'::regprocedure);
 original:='  v_candidate:=p_date;'||chr(10)||
 '  for v_row in select * from _sanabil_shift_days order by seq'||chr(10)||
 '  loop'||chr(10)||
 '    loop'||chr(10)||
 '      v_candidate:=v_candidate+1;'||chr(10)||
 '      exit when not (extract(dow from v_candidate)::smallint=any(v_excluded_weekdays))'||chr(10)||
 '        and not (v_candidate=any(v_excluded_dates))'||chr(10)||
 '        and private.effective_day_type(v_plan.student_id,v_candidate)=''study'''||chr(10)||
 '        and not exists('||chr(10)||
 '          select 1 from public.plan_days fixed'||chr(10)||
 '          where fixed.plan_id=p_plan_id'||chr(10)||
 '            and fixed.date_key=v_candidate'||chr(10)||
 '            and not exists(select 1 from _sanabil_shift_days mv where mv.id=fixed.id)'||chr(10)||
 '        )'||chr(10)||
 '        and not exists('||chr(10)||
 '          select 1 from _sanabil_shift_days assigned where assigned.new_date=v_candidate'||chr(10)||
 '        );'||chr(10)||
 '    end loop;'||chr(10)||
 '    update _sanabil_shift_days set new_date=v_candidate where id=v_row.id;'||chr(10)||
 '  end loop;';
 revised:='  IF cardinality(v_excluded_weekdays)>=7 THEN'||chr(10)||
 '    RAISE EXCEPTION ''لا توجد أيام دراسة متاحة لترحيل الخطة.'' USING errcode=''23514'';'||chr(10)||
 '  END IF;'||chr(10)||
 '  WITH eligible AS ('||chr(10)||
 '    SELECT d::date date_key,'||chr(10)||
 '      row_number() OVER(ORDER BY d)::integer seq'||chr(10)||
 '    FROM generate_series(p_date+1,p_date+v_moved*5+180,interval ''1 day'') d'||chr(10)||
 '    WHERE NOT(extract(dow from d)::smallint=any(v_excluded_weekdays))'||chr(10)||
 '      AND NOT(d::date=any(v_excluded_dates))'||chr(10)||
 '      AND private.effective_day_type(v_plan.student_id,d::date)=''study'''||chr(10)||
 '      AND NOT EXISTS(SELECT 1 FROM public.plan_days fixed'||chr(10)||
 '        WHERE fixed.plan_id=p_plan_id AND fixed.date_key=d::date'||chr(10)||
 '        AND NOT EXISTS(SELECT 1 FROM _sanabil_shift_days moved WHERE moved.id=fixed.id))'||chr(10)||
 '  )'||chr(10)||
 '  UPDATE _sanabil_shift_days s SET new_date=e.date_key'||chr(10)||
 '  FROM eligible e WHERE e.seq=s.seq;'||chr(10)||
 '  IF EXISTS(SELECT 1 FROM _sanabil_shift_days WHERE new_date IS NULL) THEN'||chr(10)||
 '    RAISE EXCEPTION ''تعذر إيجاد أيام دراسية كافية لترحيل الخطة.'' USING errcode=''23514'';'||chr(10)||
 '  END IF;';
 IF position(revised in definition)=0 THEN
   IF position(original in definition)=0 THEN
     RAISE EXCEPTION 'تغير موضع خوارزمية الترحيل؛ لن يُستبدل دون مراجعة.';
   END IF;
   EXECUTE replace(definition,original,revised);
 END IF;
END $optimize$;
