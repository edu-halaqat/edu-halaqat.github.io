-- Review coverage follows the active memorization plan, never the review's arbitrary start.
CREATE OR REPLACE FUNCTION private.memorized_review_ranges(p_student text,p_date date)
RETURNS TABLE(lo integer,hi integer) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE m public.plans%rowtype; anchor jsonb; last_done date; sn integer; an integer; idx integer; first_idx integer; last_idx integer;
BEGIN
 SELECT * INTO m FROM public.plans WHERE student_id=p_student AND type='memorization' AND status='active' ORDER BY updated_at DESC LIMIT 1;
 IF m.id IS NULL THEN RETURN; END IF;
 SELECT max(date_key) INTO last_done FROM public.plan_days WHERE plan_id=m.id AND date_key<p_date AND status='completed' AND rating IN ('ممتاز','جيد جدًا','جيد');
 SELECT coalesce(carry_from,target_from) INTO anchor FROM public.plan_days
 WHERE plan_id=m.id AND (last_done IS NULL OR date_key>last_done) AND status IN ('planned','carried')
 ORDER BY date_key LIMIT 1;
 anchor:=coalesce(anchor,m.start_ref);
 sn:=(anchor->>'surahNo')::integer;an:=(anchor->>'ayahNo')::integer;
 SELECT ayah_index INTO idx FROM public.quran_ayahs WHERE surah_no=sn AND ayah_no=an;
 IF idx IS NULL THEN RETURN; END IF;
 SELECT min(ayah_index),max(ayah_index) INTO first_idx,last_idx FROM public.quran_ayahs WHERE surah_no=sn;
 IF m.direction='toward_nas' THEN
   IF idx>1 THEN lo:=1;hi:=idx-1;RETURN NEXT; END IF;
 ELSE
   -- Within a surah, verses always progress forwards; later surahs are already memorized.
   IF an>1 THEN lo:=first_idx;hi:=idx-1;RETURN NEXT; END IF;
   IF last_idx<6236 THEN lo:=last_idx+1;hi:=6236;RETURN NEXT; END IF;
 END IF;
END;$f$;
REVOKE ALL ON FUNCTION private.memorized_review_ranges(text,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rebuild_memorized_major(p_plan_id text,p_through date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE p public.plans%rowtype; m public.plans%rowtype; r record; d date; n integer; cur integer:=1; cyc integer:=1; finish integer; v_island integer; a integer;b integer;qty integer;added integer:=0;last_ref integer;last_ref_end integer;is_partial boolean;start_day date;through_day date; sig text;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF p.id IS NULL OR p.type<>'review' THEN RAISE EXCEPTION 'خطة المراجعة الكبرى غير موجودة.'; END IF;
 SELECT * INTO m FROM public.plans WHERE student_id=p.student_id AND type='memorization' AND status='active' ORDER BY updated_at DESC LIMIT 1;
 IF m.id IS NULL THEN RETURN jsonb_build_object('ok',true,'skipped',true,'reason','no_memorization_plan');END IF;
 start_day:=greatest(p.start_date,(now() AT TIME ZONE 'Asia/Riyadh')::date);
 through_day:=greatest(start_day+60,coalesce(p_through,start_day+60));
 -- Bound work per invocation. A rolling horizon is replenished on session load.
 through_day:=least(through_day,start_day+90);
 CREATE TEMP TABLE IF NOT EXISTS _review_safe_atoms(seq integer primary key,lo integer,hi integer,island integer,partial boolean) ON COMMIT DROP;
 TRUNCATE pg_temp._review_safe_atoms;
 INSERT INTO pg_temp._review_safe_atoms
 SELECT row_number() OVER(ORDER BY a.seq,rr.lo)::integer,greatest(a.from_index,rr.lo),least(a.to_index,rr.hi),rr.lo,
   a.from_index<rr.lo OR a.to_index>rr.hi
 FROM private.quran_plan_atoms(CASE WHEN p.direction='toward_fatiha' THEN 114 ELSE 1 END,1,p.direction,p.unit) a
 CROSS JOIN private.memorized_review_ranges(p.student_id,start_day) rr
 WHERE a.to_index>=rr.lo AND a.from_index<=rr.hi
 AND (coalesce(p.methodology_meta->>'reviewRangeMode','all')<>'juz' OR EXISTS(
   SELECT 1 FROM public.quran_divisions q WHERE q.juz_no BETWEEN (p.methodology_meta->>'rangeFromJuz')::integer AND (p.methodology_meta->>'rangeToJuz')::integer
   AND q.from_index<=least(a.to_index,rr.hi) AND q.to_index>=greatest(a.from_index,rr.lo))) ORDER BY 1;
 -- Explicit subranges are also clipped to memorized boundaries.
 IF p.methodology_meta->>'reviewRangeMode'='juz' THEN
   SELECT min(from_index),max(to_index) INTO a,b FROM public.quran_divisions WHERE juz_no BETWEEN (p.methodology_meta->>'rangeFromJuz')::integer AND (p.methodology_meta->>'rangeToJuz')::integer;
   UPDATE pg_temp._review_safe_atoms SET partial=partial OR lo<a OR hi>b,lo=greatest(lo,a),hi=least(hi,b);
 END IF;
 SELECT count(*) INTO n FROM pg_temp._review_safe_atoms;
 SELECT md5(coalesce(string_agg(lo||':'||hi,',' ORDER BY lo),'')) INTO sig FROM private.memorized_review_ranges(p.student_id,start_day);
 SELECT (target_from->>'ayahIndex')::integer,(target_to->>'ayahIndex')::integer,cycle_no INTO last_ref,last_ref_end,cyc
 FROM public.plan_days WHERE plan_id=p.id AND date_key<start_day ORDER BY date_key DESC LIMIT 1;
 cyc:=coalesce(cyc,1);
 IF last_ref IS NOT NULL THEN SELECT max(seq)+1 INTO cur FROM pg_temp._review_safe_atoms WHERE hi>=least(last_ref,last_ref_end) AND lo<=greatest(last_ref,last_ref_end);END IF;
 cur:=coalesce(cur,1);
 -- Do not replace assessed, carried, annotated or historical rows.
 DELETE FROM public.plan_days WHERE plan_id=p.id AND date_key>=start_day AND status='planned' AND rating IS NULL AND completed_amount=0 AND carry_in=0 AND carry_out=0 AND notes IS NULL;
 IF n>0 THEN
 FOR d IN SELECT g::date FROM generate_series(start_day,through_day,interval '1 day') g
 WHERE NOT(extract(dow FROM g)::smallint=ANY(coalesce(p.excluded_weekdays,'{}'::smallint[])))
 AND NOT(g::date=ANY(coalesce(p.excluded_dates,'{}'::date[])))
 AND private.effective_day_type(p.student_id,g::date) IN ('study','test') ORDER BY g
 LOOP
   IF EXISTS(SELECT 1 FROM public.plan_days WHERE plan_id=p.id AND date_key=d) THEN CONTINUE;END IF;
   IF cur>n THEN cur:=1;cyc:=cyc+1;END IF;
   SELECT t.island INTO v_island FROM pg_temp._review_safe_atoms t WHERE seq=cur;
   SELECT least(n,cur+greatest(1,p.daily_amount)-1,coalesce(min(seq)-1,n)) INTO finish FROM pg_temp._review_safe_atoms t WHERE seq>cur AND t.island<>v_island;
   finish:=coalesce(finish,cur);
   SELECT min(lo),max(hi),count(*),bool_or(partial) INTO a,b,qty,is_partial FROM pg_temp._review_safe_atoms WHERE seq BETWEEN cur AND finish;
   INSERT INTO public.plan_days(plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,target_from,target_to,target_amount,status,cycle_no,segments)
   VALUES(p.id,p.org_id,p.complex_id,p.circle_id,p.student_id,p.teacher_id,d,private.quran_target_ref(a,null,null),private.quran_target_ref(b,null,null),qty,'planned',cyc,private.quran_range_segments(a,b));
   IF is_partial THEN UPDATE public.plan_days SET display_label='مراجعة المقدار المتاح من المحفوظ: '||coalesce(display_label,'') WHERE plan_id=p.id AND date_key=d;END IF;
   cur:=finish+1;added:=added+1;
 END LOOP;
 END IF;
 UPDATE public.plans SET linked_plan_id=m.id,cycle_enabled=true,end_date=greatest(end_date,through_day),materialized_through=through_day,
 methodology_meta=coalesce(methodology_meta,'{}'::jsonb)||jsonb_build_object('coverageRule','memorized_only_v2','reviewStartMode','lesson','autoMajor',false,'memorizedSignature',sig)
 WHERE id=p.id;
 RETURN jsonb_build_object('ok',true,'planId',p.id,'generatedDays',added,'availableAtoms',n,'materializedThrough',through_day);
END;$f$;
REVOKE ALL ON FUNCTION private.rebuild_memorized_major(text,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rebuild_qpc_major_review_against_recent(p_plan_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.rebuild_memorized_major(p_plan_id);$f$;
CREATE OR REPLACE FUNCTION private.rebuild_linear_major_review_against_recent(p_plan_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.rebuild_memorized_major(p_plan_id);$f$;
CREATE OR REPLACE FUNCTION private.rebuild_bounded_major_review(p_plan_id text,p_through date,p_append boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.rebuild_memorized_major(p_plan_id,p_through);$f$;
REVOKE ALL ON FUNCTION private.rebuild_qpc_major_review_against_recent(text),private.rebuild_linear_major_review_against_recent(text),private.rebuild_bounded_major_review(text,date,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.memorized_recent_window(p_student text,p_date date,p_unit public.plan_unit,p_amount integer)
RETURNS TABLE(start_index integer,end_index integer,actual_amount integer,segments jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
WITH mem AS (SELECT direction FROM public.plans WHERE student_id=p_student AND type='memorization' AND status='active' ORDER BY updated_at DESC LIMIT 1),
parts AS (SELECT a.seq,greatest(a.from_index,r.lo) lo,least(a.to_index,r.hi) hi FROM private.quran_plan_atoms(1,1,'toward_nas',p_unit) a
 CROSS JOIN private.memorized_review_ranges(p_student,p_date) r WHERE a.to_index>=r.lo AND a.from_index<=r.hi),
chosen AS (SELECT * FROM parts ORDER BY CASE WHEN (SELECT direction FROM mem)='toward_nas' THEN -seq ELSE seq END,lo LIMIT p_amount)
SELECT min(lo),max(hi),count(*)::integer,
 coalesce((SELECT jsonb_agg(x.value ORDER BY c.lo,x.ordinality) FROM chosen c CROSS JOIN LATERAL jsonb_array_elements(private.quran_range_segments(c.lo,c.hi)) WITH ORDINALITY x(value,ordinality)),'[]'::jsonb)
FROM chosen;$f$;
REVOKE ALL ON FUNCTION private.memorized_recent_window(text,date,public.plan_unit,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rebuild_recent_review_plan(p_plan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=(select auth.uid());
 v_plan public.plans%rowtype;
 v_mem public.plans%rowtype;
 v_md public.plan_days%rowtype;
 v_win record;
 v_from jsonb;
 v_to jsonb;
 v_segments jsonb;
 v_preserve_until date;
 v_generated integer:=0;
 v_generated_dates date[]:='{}'::date[];
 v_first_ref jsonb;
begin
 select * into v_plan from public.plans where id=p_plan_id for update;
 if not found or v_plan.type<>'recent_review' then raise exception 'خطة المراجعة الصغرى غير موجودة.'; end if;
 if v_plan.unit::text not in('pages','ayahs','surahs') then raise exception 'وحدة المراجعة الصغرى غير صالحة.'; end if;

 if v_plan.linked_plan_id is not null then
   select * into v_mem from public.plans
   where id=v_plan.linked_plan_id and student_id=v_plan.student_id and type='memorization' and status='active';
 end if;
 if v_mem.id is null then
   select * into v_mem from public.plans
   where student_id=v_plan.student_id and type='memorization' and status='active'
     and start_date<=v_plan.end_date and end_date>=v_plan.start_date
   order by updated_at desc limit 1;
 end if;
 if v_mem.id is null then raise exception 'أنشئ خطة الحفظ الجديد أولًا؛ فالمراجعة الصغرى تتبع درس الطالب ولا تملك بداية مستقلة.'; end if;

 update public.plans set linked_plan_id=v_mem.id,direction='toward_nas'::public.plan_direction,
   cycle_enabled=false,name=coalesce(nullif(name,''),'المراجعة الصغرى'),updated_at=now(),updated_by=v_actor
 where id=v_plan.id
   and (linked_plan_id,direction,cycle_enabled,name) is distinct from
       (v_mem.id,'toward_nas'::public.plan_direction,false,coalesce(nullif(v_plan.name,''),'المراجعة الصغرى'));

 select max(pd.date_key) into v_preserve_until
 from public.plan_days pd
 where pd.plan_id=v_plan.id
   and (pd.rating is not null or coalesce(pd.completed_amount,0)>0 or pd.status<>'planned' or pd.date_key<(now() AT TIME ZONE 'Asia/Riyadh')::date);

 -- Retain matching rows; remove obsolete dates after generating the desired set.

 for v_md in
   select pd.id,pd.plan_id,pd.org_id,pd.complex_id,pd.circle_id,pd.student_id,pd.teacher_id,
          g::date as date_key,pd.target_from,pd.target_to,pd.target_amount,pd.completed_amount,pd.carry_in,pd.carry_out,pd.rating,pd.notes,pd.status,pd.created_at,pd.created_by,pd.updated_at,pd.updated_by,pd.carry_from,pd.cycle_no,pd.segments,pd.display_label
   from generate_series(greatest(v_plan.start_date,(now() AT TIME ZONE 'Asia/Riyadh')::date),
     least(v_plan.end_date,(now() AT TIME ZONE 'Asia/Riyadh')::date+60),interval '1 day') g
   cross join lateral (select x.* from public.plan_days x where x.plan_id=v_mem.id and x.date_key<=g::date
     and x.target_to is not null order by x.date_key desc limit 1) pd
   where (v_preserve_until is null or g::date>v_preserve_until)
     and not(extract(dow from g)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
     and not(g::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
     and private.effective_day_type(v_plan.student_id,g::date) in ('study','test')
   order by g
 loop
   select * into v_win
   from private.memorized_recent_window(v_plan.student_id,v_md.date_key,v_plan.unit,v_plan.daily_amount);
   if v_win.start_index is null then continue; end if;

   v_from:=private.quran_target_ref(
     v_win.start_index,
     (select q.page_no::integer from public.quran_ayahs q where q.ayah_index=v_win.start_index limit 1),
     null
   );
   v_to:=private.quran_target_ref(
     v_win.end_index,
     (select q.page_no::integer from public.quran_ayahs q where q.ayah_index=v_win.end_index limit 1),
     null
   );
   v_segments:=v_win.segments;
   if v_first_ref is null then v_first_ref:=v_from; end if;

   insert into public.plan_days(
     plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
     target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
   ) values(
     v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,v_md.date_key,
     v_from,v_to,v_win.actual_amount,'planned',v_actor,v_actor,1,v_segments
   )
   on conflict(plan_id,date_key) do update set
     org_id=excluded.org_id,complex_id=excluded.complex_id,circle_id=excluded.circle_id,
     student_id=excluded.student_id,teacher_id=excluded.teacher_id,
     target_from=excluded.target_from,target_to=excluded.target_to,target_amount=excluded.target_amount,
     segments=excluded.segments,updated_at=now(),updated_by=v_actor
   where (plan_days.org_id,plan_days.complex_id,plan_days.circle_id,plan_days.student_id,plan_days.teacher_id,
          plan_days.target_from,plan_days.target_to,plan_days.target_amount,plan_days.segments)
     is distinct from (excluded.org_id,excluded.complex_id,excluded.circle_id,excluded.student_id,excluded.teacher_id,
          excluded.target_from,excluded.target_to,excluded.target_amount,excluded.segments);
   v_generated_dates:=array_append(v_generated_dates,v_md.date_key);
   v_generated:=v_generated+1;
 end loop;

 delete from public.plan_days pd
 where pd.plan_id=v_plan.id
   and (v_preserve_until is null or pd.date_key>v_preserve_until)
   and pd.date_key<=least(v_plan.end_date,(now() AT TIME ZONE 'Asia/Riyadh')::date+60)
   and not (pd.date_key=any(v_generated_dates));

 if v_first_ref is not null then
   update public.plans set start_ref=v_first_ref,linked_plan_id=v_mem.id,updated_at=now(),updated_by=v_actor
   where id=v_plan.id
     and (start_ref,linked_plan_id) is distinct from (v_first_ref,v_mem.id);
 end if;

 return jsonb_build_object('ok',true,'planId',v_plan.id,'linkedMemorizationPlanId',v_mem.id,
   'generatedDays',v_generated,'preservedThrough',v_preserve_until,'rolling',true);
end;
$function$


;
CREATE OR REPLACE FUNCTION public.save_memorized_review_guarded(p_plan_id text,p_student_id text,p_teacher_id text,p_unit public.plan_unit,p_daily_amount integer,p_direction public.plan_direction,p_start_date date,p_excluded_weekdays smallint[],p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE s public.students%rowtype;m public.plans%rowtype;old public.plans%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT private.active_user() THEN RAISE EXCEPTION 'يلزم تسجيل الدخول.' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.students WHERE id=p_student_id AND active;
 IF s.id IS NULL OR NOT private.can_access(s.org_id,s.complex_id,s.circle_id,array['admin','manager','supervisor','teacher']::public.app_role[]) THEN RAISE EXCEPTION 'لا تملك صلاحية خطة الطالب.' USING ERRCODE='42501';END IF;
 IF p_teacher_id IS DISTINCT FROM s.teacher_id THEN RAISE EXCEPTION 'المعلم لا يطابق إسناد الطالب.';END IF;
 IF p_daily_amount IS NULL OR p_daily_amount NOT BETWEEN 1 AND 45 OR p_direction IS NULL OR p_start_date IS NULL OR p_unit::text NOT IN ('ayahs','pages','surahs','juz','hizb','half_hizb','quarter_hizb') THEN RAISE EXCEPTION 'راجع مقدار المراجعة واتجاهها.';END IF;
 SELECT * INTO m FROM public.plans WHERE student_id=s.id AND status='active' AND type='memorization' ORDER BY updated_at DESC LIMIT 1;
 IF m.id IS NULL THEN RAISE EXCEPTION 'أنشئ خطة الحفظ لتحديد المحفوظ أولًا.';END IF;
 SELECT * INTO old FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF old.id IS NOT NULL AND (old.student_id<>s.id OR old.type<>'review') THEN RAISE EXCEPTION 'خطة المراجعة لا تتبع الطالب.' USING ERRCODE='42501';END IF;
 INSERT INTO public.plans(id,org_id,complex_id,circle_id,student_id,teacher_id,type,unit,daily_amount,direction,start_ref,start_date,end_date,excluded_weekdays,status,name,cycle_enabled,linked_plan_id,created_by,updated_by,methodology_meta)
 VALUES(p_plan_id,s.org_id,s.complex_id,s.circle_id,s.id,s.teacher_id,'review',p_unit,p_daily_amount,p_direction,m.start_ref,p_start_date,greatest(m.end_date,p_start_date+90),coalesce(p_excluded_weekdays,m.excluded_weekdays),'active',coalesce(nullif(p_name,''),'المراجعة الكبرى'),true,m.id,auth.uid(),auth.uid(),'{"reviewStartMode":"lesson","coverageRule":"memorized_only_v2"}')
 ON CONFLICT(id) DO UPDATE SET unit=excluded.unit,daily_amount=excluded.daily_amount,direction=excluded.direction,name=excluded.name,excluded_weekdays=excluded.excluded_weekdays,updated_at=now(),updated_by=auth.uid();
 RETURN private.rebuild_memorized_major(p_plan_id);
END;$f$;
REVOKE ALL ON FUNCTION public.save_memorized_review_guarded(text,text,text,public.plan_unit,integer,public.plan_direction,date,smallint[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_memorized_review_guarded(text,text,text,public.plan_unit,integer,public.plan_direction,date,smallint[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_plan_bundle(p_student_id text, p_teacher_id text, p_start_date date, p_end_date date, p_excluded_weekdays smallint[], p_tracks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '45s'
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_track jsonb;
  v_type text;
  v_plan_id text;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_mem_count integer:=0;
  v_recent_count integer:=0;
  v_name text;
  v_surah_name text;
  v_direction public.plan_direction;
  v_unit public.plan_unit;
  v_active_review_count integer:=0;
  v_low record;
  v_high record;
  v_split integer;
  v_paired boolean:=false;
  v_pair_blocked_by_history boolean:=false;
  v_meeting jsonb:=null;
  v_low_rub integer;
  v_high_rub integer;
  v_low_factor integer;
  v_high_factor integer;
  v_align integer;
  v_mid integer;
  v_low_qpc boolean;
  v_high_qpc boolean;
  v_bundle_end date;
  v_mem_projection jsonb;
begin
  if v_actor is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;
  if p_start_date is null then
    raise exception 'حدد تاريخ بداية الخطة.';
  end if;
  if p_tracks is null or jsonb_typeof(p_tracks)<>'array'
     or jsonb_array_length(p_tracks)<1 or jsonb_array_length(p_tracks)>10 then
    raise exception 'اختر مسارًا تعليميًا واحدًا على الأقل، وبحد أقصى عشرة مسارات.';
  end if;

  select count(*) filter(where x->>'type'='memorization'),
         count(*) filter(where x->>'type'='recent_review')
  into v_mem_count,v_recent_count
  from jsonb_array_elements(p_tracks) x;

  if v_mem_count>1 then raise exception 'يمكن إنشاء خطة حفظ جديدة واحدة فقط في الفترة نفسها.'; end if;
  if v_recent_count>1 then raise exception 'يمكن إنشاء خطة مراجعة صغرى واحدة فقط في الفترة نفسها.'; end if;

  v_bundle_end:=p_end_date;
  if v_bundle_end is null and v_mem_count=1 then
    select value into v_track
    from jsonb_array_elements(p_tracks)
    where value->>'type'='memorization'
    limit 1;
    v_mem_projection:=public.estimate_plan_completion(
      (v_track->>'startSurah')::integer,
      (v_track->>'startAyah')::integer,
      (v_track->>'direction')::public.plan_direction,
      (v_track->>'unit')::public.plan_unit,
      (v_track->>'dailyAmount')::integer,
      p_start_date,
      coalesce(p_excluded_weekdays,'{}'::smallint[])
    );
    v_bundle_end:=(v_mem_projection->>'projectedCompletionDate')::date;
  end if;
  if v_bundle_end is null then
    select greatest(end_date,p_start_date+90) into v_bundle_end from public.plans where student_id=p_student_id and type='memorization' and status='active' order by updated_at desc limit 1;
  end if;
  if v_bundle_end is null or v_bundle_end<p_start_date then
    raise exception 'المسار الذي لا يحتوي خطة حفظ يحتاج تاريخ نهاية.';
  end if;

  -- الحفظ أولًا، ثم المراجعة الصغرى المشتقة منه، ثم المراجعات الكبرى.
  for v_track in
    select value
    from jsonb_array_elements(p_tracks)
    order by case value->>'type' when 'memorization' then 1 when 'recent_review' then 2 when 'review' then 3 else 9 end
  loop
    v_type:=v_track->>'type';
    if v_type not in('memorization','recent_review','review') then raise exception 'نوع المسار غير صالح.'; end if;
    if coalesce((v_track->>'dailyAmount')::integer,0) not between 1 and 45 then raise exception 'مقدار أحد المسارات غير صالح.'; end if;

    if v_type='memorization' and coalesce(v_track->>'unit','') not in('lines','pages','ayahs') then
      raise exception 'الحفظ الجديد يقاس بالأسطر أو الصفحات أو الآيات.';
    elsif v_type='recent_review' and coalesce(v_track->>'unit','') not in('pages','ayahs','surahs') then
      raise exception 'المراجعة الصغرى تقاس بالصفحات أو الآيات أو السور.';
    elsif v_type='review' and coalesce(v_track->>'unit','') not in('surahs','pages','ayahs','juz','hizb','half_hizb','quarter_hizb') then
      raise exception 'وحدة المراجعة الكبرى غير صالحة.';
    end if;

    v_plan_id:=coalesce(nullif(v_track->>'id',''),extensions.gen_random_uuid()::text);
    v_unit:=(v_track->>'unit')::public.plan_unit;

    if v_type='recent_review' then
      v_result:=public.save_recent_review_plan(
        v_plan_id,p_student_id,p_teacher_id,v_unit,(v_track->>'dailyAmount')::integer,
        p_start_date,v_bundle_end,coalesce(p_excluded_weekdays,'{}'::smallint[]),'active'
      );
      v_name:='المراجعة الصغرى';
    elsif v_type='review' then
      v_name:=coalesce(nullif(v_track->>'name',''),'المراجعة الكبرى');
      v_result:=public.save_memorized_review_guarded(v_plan_id,p_student_id,p_teacher_id,v_unit,(v_track->>'dailyAmount')::integer,
        (v_track->>'direction')::public.plan_direction,p_start_date,p_excluded_weekdays,v_name);
      if v_track->'methodologyMeta'->>'reviewRangeMode'='juz' then
        update public.plans set methodology_meta=methodology_meta||(v_track->'methodologyMeta')||jsonb_build_object('autoMajor',false,'reviewStartMode','lesson') where id=v_plan_id;
        v_result:=private.rebuild_memorized_major(v_plan_id);
      end if;
    else
      if coalesce(v_track->>'direction','') not in('toward_nas','toward_fatiha') then
        raise exception 'اتجاه أحد المسارات غير صالح.';
      end if;
      if coalesce((v_track->>'startSurah')::integer,0) not between 1 and 114 then
        raise exception 'سورة بداية أحد المسارات غير صالحة.';
      end if;
      if not exists(
        select 1 from public.quran_ayahs q
        where q.surah_no=(v_track->>'startSurah')::integer
          and q.ayah_no=(v_track->>'startAyah')::integer
      ) then raise exception 'آية بداية أحد المسارات غير موجودة.'; end if;

      v_direction:=(v_track->>'direction')::public.plan_direction;
      if v_type='review' and v_track->'methodologyMeta'->>'reviewRangeMode'='juz' then
        perform * from private.bounded_review_atoms(v_unit,v_direction,(v_track->'methodologyMeta'->>'rangeFromJuz')::integer,(v_track->'methodologyMeta'->>'rangeToJuz')::integer);
        select v_track||jsonb_build_object('startSurah',q.surah_no,'startAyah',q.ayah_no) into v_track
        from public.quran_ayahs q where q.ayah_index=(select case when v_direction='toward_fatiha' then max(d.to_index) else min(d.from_index) end
          from public.quran_divisions d where d.juz_no between (v_track->'methodologyMeta'->>'rangeFromJuz')::integer and (v_track->'methodologyMeta'->>'rangeToJuz')::integer);
      end if;

      v_result:=public.save_plan_with_days(
        v_plan_id,p_student_id,p_teacher_id,null,v_type,v_unit,
        (v_track->>'dailyAmount')::integer,v_direction,
        (v_track->>'startSurah')::integer,(v_track->>'startAyah')::integer,
        p_start_date,v_bundle_end,coalesce(p_excluded_weekdays,'{}'::smallint[]),'active',false
      );

      select min(q.name_ar) into v_surah_name
      from public.quran_ayahs q where q.surah_no=(v_track->>'startSurah')::integer;

      v_name:=nullif(btrim(coalesce(v_track->>'name','')),'');
      if v_name is null then
        v_name:=case v_type
          when 'memorization' then 'الحفظ الجديد'
          else 'المراجعة الكبرى · من '||coalesce(v_surah_name,'الموضع المحدد')||' '||
            case when v_direction='toward_fatiha' then 'نحو الفاتحة' else 'نحو الناس' end
        end;
      end if;
      update public.plans
      set name=v_name,cycle_enabled=(v_type='review'),
          methodology_meta=case
            when v_type='review' and jsonb_typeof(v_track->'methodologyMeta')='object'
              then v_track->'methodologyMeta'
            else methodology_meta
          end,
          updated_at=now(),updated_by=v_actor
      where id=v_plan_id;
    end if;

    if v_type='review' and v_track->'methodologyMeta'->>'reviewRangeMode'='juz' then
      perform private.rebuild_bounded_major_review(v_plan_id,v_bundle_end,false);
    end if;

    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'type',v_type,'planId',v_plan_id,'name',v_name,'cycleEnabled',(v_type='review'),'result',v_result
    ));
    v_count:=v_count+1;
  end loop;

  select count(*) into v_active_review_count
  from public.plans p
  where p.student_id=p_student_id and p.status='active' and p.type='review'
    and p.start_date<=v_bundle_end and p.end_date>=p_start_date;

  if false and v_active_review_count=2 and not exists(select 1 from public.plans where student_id=p_student_id and status='active' and type='review' and methodology_meta->>'reviewRangeMode'='juz') then
    select p.id plan_id,(p.start_ref->>'surahNo')::integer start_surah,
           nullif(p.start_ref->>'ayahIndex','')::integer start_idx,p.direction,p.unit
    into v_low
    from public.plans p
    where p.student_id=p_student_id and p.status='active' and p.type='review'
      and p.start_date<=v_bundle_end and p.end_date>=p_start_date
    order by coalesce(nullif(p.start_ref->>'ayahIndex','')::integer,0) asc,p.created_at asc limit 1;

    select p.id plan_id,(p.start_ref->>'surahNo')::integer start_surah,
           nullif(p.start_ref->>'ayahIndex','')::integer start_idx,p.direction,p.unit
    into v_high
    from public.plans p
    where p.student_id=p_student_id and p.status='active' and p.type='review'
      and p.start_date<=v_bundle_end and p.end_date>=p_start_date
    order by coalesce(nullif(p.start_ref->>'ayahIndex','')::integer,0) desc,p.created_at asc limit 1;

    if v_low.plan_id is not null and v_high.plan_id is not null and v_low.plan_id<>v_high.plan_id
       and v_low.direction='toward_nas'::public.plan_direction
       and v_high.direction='toward_fatiha'::public.plan_direction then

      if exists(
        select 1 from public.plan_days pd
        where pd.plan_id in(v_low.plan_id,v_high.plan_id)
          and (pd.rating is not null or coalesce(pd.completed_amount,0)>0
               or coalesce(pd.carry_in,0)>0 or coalesce(pd.carry_out,0)>0)
      ) then
        v_pair_blocked_by_history:=true;
      else
        v_low_qpc:=v_low.unit::text in('quarter_hizb','half_hizb','hizb','juz');
        v_high_qpc:=v_high.unit::text in('quarter_hizb','half_hizb','hizb','juz');

        if v_low_qpc and v_high_qpc then
          select d.rub_no into v_low_rub from public.quran_divisions d
          where v_low.start_idx between d.from_index and d.to_index order by d.rub_no limit 1;
          select d.rub_no into v_high_rub from public.quran_divisions d
          where v_high.start_idx between d.from_index and d.to_index order by d.rub_no limit 1;

          v_low_factor:=case v_low.unit::text when 'quarter_hizb' then 1 when 'half_hizb' then 2 when 'hizb' then 4 else 8 end;
          v_high_factor:=case v_high.unit::text when 'quarter_hizb' then 1 when 'half_hizb' then 2 when 'hizb' then 4 else 8 end;
          v_align:=greatest(v_low_factor,v_high_factor);
          v_mid:=floor((v_low_rub+v_high_rub)::numeric/2)::integer;
          v_split:=floor(v_mid::numeric/v_align)::integer*v_align;
          if v_split<v_low_rub then v_split:=v_split+v_align; end if;
          if v_split>=v_high_rub then v_split:=v_high_rub-1; end if;

          if v_split>=v_low_rub and v_split<v_high_rub then
            perform private.rebuild_review_plan_rub_range(v_low.plan_id,v_split);
            perform private.rebuild_review_plan_rub_range(v_high.plan_id,v_split+1);
            v_paired:=true;
            v_meeting:=jsonb_build_object(
              'mode','qpc_hizb','lowerPlanId',v_low.plan_id,'lowerEndRub',v_split,
              'higherPlanId',v_high.plan_id,'higherEndRub',v_split+1,
              'betweenRub',jsonb_build_array(v_split,v_split+1)
            );
          end if;
        elsif not v_low_qpc and not v_high_qpc and v_low.start_surah<v_high.start_surah then
          v_split:=floor((v_low.start_surah+v_high.start_surah)::numeric/2)::integer;
          perform private.rebuild_review_plan_range(v_low.plan_id,v_split);
          perform private.rebuild_review_plan_range(v_high.plan_id,v_split+1);
          v_paired:=true;
          v_meeting:=jsonb_build_object(
            'mode','surah','lowerPlanId',v_low.plan_id,'lowerEndSurah',v_split,
            'higherPlanId',v_high.plan_id,'higherEndSurah',v_split+1,
            'betweenSurahs',jsonb_build_array(v_split,v_split+1)
          );
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'createdTracks',v_count,'tracks',v_results,
    'pairedMajorReviews',v_paired,'pairBlockedByHistory',v_pair_blocked_by_history,'meeting',v_meeting,
    'bundleEndDate',v_bundle_end,
    'projectedCompletionDate',case when v_mem_projection is not null then v_bundle_end else null end
  );
end;
$function$

;

CREATE OR REPLACE FUNCTION public.get_daily_assignments(p_circle_id text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.circles%rowtype;
  out jsonb;
  rp record;
begin
  select * into c from public.circles where id=p_circle_id and active;
  if not found then raise exception 'الحلقة غير موجودة أو غير نشطة.'; end if;
  if not private.can_access(c.org_id,c.complex_id,c.id,array['admin','manager','supervisor','teacher']::public.app_role[]) then
    raise exception 'لا تملك صلاحية عرض هذه الحلقة.' using errcode='42501';
  end if;

  -- Replenish only missing current-day reviews; canonical plan types serve both UIs.
  if p_date=(now() at time zone 'Asia/Riyadh')::date then
    for rp in select p.id,p.type from public.plans p join public.students s on s.id=p.student_id
      where s.circle_id=c.id and s.active and p.status='active' and p.type in ('recent_review','review')
      and p.start_date<=p_date and private.effective_day_type(s.id,p_date) in ('study','test')
      and not(extract(dow from p_date)::smallint=any(coalesce(p.excluded_weekdays,'{}'::smallint[])))
      and not(p_date=any(coalesce(p.excluded_dates,'{}'::date[])))
      and not exists(select 1 from public.plan_days d where d.plan_id=p.id and d.date_key=p_date)
    loop
      if rp.type='review' then perform private.rebuild_memorized_major(rp.id);
      else perform private.rebuild_recent_review_plan(rp.id);end if;
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId',s.id,'fullName',s.full_name,'teacherId',s.teacher_id,'guardianPhone',s.guardian_phone,
    'memorization',case when md.id is null then null else jsonb_build_object(
      'planId',mp.id,'planName',coalesce(mp.name,'الحفظ الجديد'),'dayId',md.id,
      'from',coalesce(md.carry_from,md.target_from),'to',md.target_to,'plannedFrom',md.target_from,
      'amount',coalesce(md.target_amount,0)+coalesce(md.carry_in,0),'carryIn',md.carry_in,
      'unit',mp.unit,'direction',mp.direction,'cycleNo',md.cycle_no,'segments',md.segments,'displayLabel',md.display_label
    ) end,
    'recentReview',case when sd.id is null then null else jsonb_build_object(
      'planId',sp.id,'planName',coalesce(sp.name,'المراجعة الصغرى'),'dayId',sd.id,
      'from',coalesce(sd.carry_from,sd.target_from),'to',sd.target_to,'plannedFrom',sd.target_from,
      'amount',coalesce(sd.target_amount,0)+coalesce(sd.carry_in,0),'carryIn',sd.carry_in,
      'unit',sp.unit,'direction',sp.direction,'cycleNo',sd.cycle_no,'segments',sd.segments,'displayLabel',sd.display_label
    ) end,
    'reviews',coalesce(rv.items,'[]'::jsonb),
    'review',case when jsonb_array_length(coalesce(rv.items,'[]'::jsonb))=0 then null else (rv.items->0) end,
    'memorizationRating',coalesce(md.rating,o.memorization_rating),
    'recentReviewRating',coalesce(sd.rating,o.recent_review_rating),
    'reviewRating',o.review_rating,
    'notes',o.notes,'recitationMetrics',o.recitation_metrics,
    'outcomeSavedAt',o.updated_at,
    'attendanceStatus',sa.status,'attendanceNote',sa.note
  ) order by s.full_name),'[]'::jsonb)
  into out
  from public.students s
  left join lateral (
    select p.* from public.plans p
    where p.student_id=s.id and p.status='active' and p.type='memorization'
      and p.start_date<=p_date and p.end_date>=p_date
    order by p.updated_at desc limit 1
  ) mp on true
  left join public.plan_days md on md.plan_id=mp.id and md.date_key=p_date
    and private.effective_day_type(s.id,p_date)='study'
  left join lateral (
    select p.* from public.plans p
    where p.student_id=s.id and p.status='active' and p.type='recent_review'
      and p.start_date<=p_date and p.end_date>=p_date
    order by p.updated_at desc limit 1
  ) sp on true
  left join public.plan_days sd on sd.plan_id=sp.id and sd.date_key=p_date
    and private.effective_day_type(s.id,p_date) in ('study','test')
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'planId',p.id,'planName',coalesce(nullif(p.name,''),'المراجعة الكبرى'),'dayId',pd.id,
      'from',coalesce(pd.carry_from,pd.target_from),'to',pd.target_to,'plannedFrom',pd.target_from,
      'amount',coalesce(pd.target_amount,0)+coalesce(pd.carry_in,0),'carryIn',pd.carry_in,
      'unit',p.unit,'direction',p.direction,'cycleNo',pd.cycle_no,'rating',pd.rating,'segments',pd.segments,
      'displayLabel',pd.display_label
    ) order by p.created_at,p.id) items
    from public.plans p
    join public.plan_days pd on pd.plan_id=p.id and pd.date_key=p_date
    where p.student_id=s.id and p.status='active' and p.type='review'
      and p.start_date<=p_date and p.end_date>=p_date
      and private.effective_day_type(s.id,p_date) in ('study','test')
  ) rv on true
  left join public.outcomes o on o.student_id=s.id and o.date_key=p_date
  left join public.student_attendance sa on sa.student_id=s.id and sa.date_key=p_date
  where s.circle_id=p_circle_id and s.active;

  return out;
end;
$function$

;

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
  -- Review edits validate the actual memorized set, not arbitrary future projections.
  if v_plan.type='review' and not v_was_saved then
    if v_from.ayah_index>v_to.ayah_index or
      (select coalesce(sum(least(hi,v_to.ayah_index)-greatest(lo,v_from.ayah_index)+1),0)
       from private.memorized_review_ranges(v_student.id,v_day.date_key)
       where hi>=v_from.ayah_index and lo<=v_to.ayah_index)<>v_to.ayah_index-v_from.ayah_index+1 then
      raise exception 'المقرر خارج المحفوظ المستنتج من خطة الحفظ الحالية.' using errcode='23514';
    end if;
    if v_plan.methodology_meta->>'reviewRangeMode'='juz' and exists(
      select 1 from public.quran_ayahs where ayah_index between v_from.ayah_index and v_to.ayah_index
      and juz_no not between (v_plan.methodology_meta->>'rangeFromJuz')::integer and (v_plan.methodology_meta->>'rangeToJuz')::integer) then
      raise exception 'المقرر خارج نطاق المراجعة المحدد.' using errcode='23514';
    end if;
    update public.plan_days set target_from=private.quran_target_ref(v_from.ayah_index,v_from.page_no::integer,null),
      target_to=private.quran_target_ref(v_to.ayah_index,v_to.page_no::integer,null),
      segments=private.quran_range_segments(v_from.ayah_index,v_to.ayah_index),display_label=null,
      updated_at=now(),updated_by=v_actor where id=v_day.id;
    insert into public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
    values(v_student.org_id,'plan.daily_review_range_edited',v_actor,'plan_days',v_day.id,
      jsonb_build_object('oldFrom',v_day.target_from,'oldTo',v_day.target_to,'fromIndex',v_from.ayah_index,'toIndex',v_to.ayah_index));
    return jsonb_build_object('ok',true,'dayId',v_day.id,'planId',v_plan.id,
      'from',private.quran_target_ref(v_from.ayah_index,v_from.page_no::integer,null),
      'to',private.quran_target_ref(v_to.ayah_index,v_to.page_no::integer,null));
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
    -- SANABIL_SAFE_CARRY_CORRECTION_20261027: no later assessed data may be changed.
    if v_plan.type='memorization' then
      if v_day.status not in ('completed','carried')
         or v_day.rating not in ('ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع') then
        raise exception 'تعذر تصحيح الحفظ: حالة الحصيلة السابقة غير معتمدة. راجع المشرف.' using errcode='55000';
      end if;
    elsif v_day.status <> 'completed'
         or v_day.rating not in ('ممتاز','جيد جدًا','جيد')
         or coalesce(v_day.carry_in,0)<>0 or coalesce(v_day.carry_out,0)<>0 then
      raise exception 'هذا المقرر مرتبط بترحيل أو تقدير غير مكتمل؛ يلزم تصحيحه إداريًا دون تغيير النتائج السابقة.' using errcode='55000';
    end if;
    if exists(
      select 1 from public.plan_days pd
      where pd.student_id=v_day.student_id and pd.date_key>v_day.date_key
        and (pd.rating is not null or pd.status<>'planned'
          or coalesce(pd.completed_amount,0)>0
          or coalesce(pd.carry_out,0)>0
          or exists (select 1 from public.outcomes o where o.student_id=pd.student_id and o.date_key=pd.date_key))
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
    -- Future unrated carry is a projection, not a finalized result.
    -- Clear only temporary forward carry in the same rollback-safe transaction.
    if v_plan.type='memorization' then
      update public.plan_days pd set
        carry_in=0,carry_from=null,updated_at=now(),updated_by=v_actor
      where pd.plan_id=v_plan.id and pd.date_key>v_day.date_key
        and pd.status='planned' and pd.rating is null
        and coalesce(pd.completed_amount,0)=0 and coalesce(pd.carry_out,0)=0
        and (coalesce(pd.carry_in,0)<>0 or pd.carry_from is not null);
    end if;
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
    if exists (
      select 1 from public.plan_days pd where pd.id=v_day.id
        and (pd.rating is distinct from v_day.rating
          or pd.status is distinct from v_day.status)
    ) then
      raise exception 'لم تتطابق حالة التسميع بعد التصحيح؛ تم التراجع عن العملية.' using errcode='55000';
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

CREATE OR REPLACE FUNCTION private.horizon_append_qpc(p_plan_id text,p_through date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.rebuild_memorized_major(p_plan_id,p_through);$f$;
REVOKE ALL ON FUNCTION private.horizon_append_qpc(text,date) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.horizon_append_linear(p_plan_id text,p_through date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.rebuild_memorized_major(p_plan_id,p_through);$f$;
REVOKE ALL ON FUNCTION private.horizon_append_linear(text,date) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.horizon_append_recent(p_recent_id text,p_mem_id text,p_from_date date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT private.rebuild_recent_review_plan(p_recent_id);$f$;
REVOKE ALL ON FUNCTION private.horizon_append_recent(text,text,date) FROM PUBLIC,anon,authenticated;
