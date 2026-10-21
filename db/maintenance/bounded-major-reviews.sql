-- Explicit juz ranges are opt-in; legacy plans retain their existing behavior.
BEGIN;
CREATE OR REPLACE FUNCTION private.bounded_review_atoms(p_unit public.plan_unit,p_direction public.plan_direction,p_first integer,p_last integer)
RETURNS TABLE(seq integer,from_index integer,to_index integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE lo integer; hi integer; q public.quran_ayahs%rowtype;
BEGIN
 IF p_first IS NULL OR p_last IS NULL OR p_first<1 OR p_last>30 OR p_first>p_last THEN
  RAISE EXCEPTION 'حدد نطاق أجزاء صحيحًا من 1 إلى 30.';
 END IF;
 IF p_unit::text NOT IN ('juz','hizb','half_hizb','quarter_hizb','surahs','pages','ayahs') OR p_direction IS NULL THEN
  RAISE EXCEPTION 'وحدة المراجعة أو اتجاهها غير صالح.';
 END IF;
 SELECT min(d.from_index),max(d.to_index) INTO lo,hi FROM public.quran_divisions d WHERE d.juz_no BETWEEN p_first AND p_last;
 IF lo IS NULL OR hi IS NULL THEN RAISE EXCEPTION 'حدود الأجزاء غير متاحة.'; END IF;
 SELECT * INTO q FROM public.quran_ayahs WHERE ayah_index=CASE WHEN p_direction='toward_fatiha' THEN hi ELSE lo END;
 RETURN QUERY SELECT row_number() OVER(ORDER BY CASE WHEN p_direction='toward_fatiha' THEN -a.seq ELSE a.seq END)::integer,greatest(lo,a.from_index),least(hi,a.to_index)
 FROM private.quran_plan_atoms(1,1,'toward_nas'::public.plan_direction,p_unit) a
 WHERE a.to_index>=lo AND a.from_index<=hi ORDER BY 1;
END;
$fn$;
REVOKE ALL ON FUNCTION private.bounded_review_atoms(public.plan_unit,public.plan_direction,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rebuild_bounded_major_review(p_plan_id text,p_through date,p_append boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p public.plans%rowtype; last_day public.plan_days%rowtype; keep_until date;
 total integer; cursor_no integer:=1; cycle integer:=1; amount integer; d date;
 first_juz integer; last_juz integer; a integer; b integer; added integer:=0; seg jsonb;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND OR p.type<>'review' OR p.methodology_meta->>'reviewRangeMode' IS DISTINCT FROM 'juz' THEN
  RAISE EXCEPTION 'خطة المراجعة ذات النطاق غير موجودة.';
 END IF;
 first_juz:=(p.methodology_meta->>'rangeFromJuz')::integer;
 last_juz:=(p.methodology_meta->>'rangeToJuz')::integer;
 CREATE TEMP TABLE IF NOT EXISTS _bounded_review_atoms(seq integer PRIMARY KEY,from_index integer,to_index integer) ON COMMIT DROP;
 TRUNCATE pg_temp._bounded_review_atoms;
 INSERT INTO pg_temp._bounded_review_atoms SELECT * FROM private.bounded_review_atoms(p.unit,p.direction,first_juz,last_juz);
 SELECT count(*) INTO total FROM pg_temp._bounded_review_atoms;
 IF total=0 THEN RAISE EXCEPTION 'النطاق لا يحتوي مقررًا قابلًا للتوزيع.'; END IF;
 IF p_append THEN
  SELECT max(date_key) INTO keep_until FROM public.plan_days WHERE plan_id=p.id;
 ELSE
  SELECT max(date_key) INTO keep_until FROM public.plan_days WHERE plan_id=p.id AND
   (rating IS NOT NULL OR completed_amount>0 OR carry_in>0 OR carry_out>0 OR status<>'planned' OR notes IS NOT NULL OR date_key<current_date);
 END IF;
 IF keep_until IS NOT NULL THEN
  SELECT * INTO last_day FROM public.plan_days WHERE plan_id=p.id AND date_key=keep_until;
  cycle:=last_day.cycle_no;
  SELECT max(t.seq)+1 INTO cursor_no FROM pg_temp._bounded_review_atoms t
   WHERE CASE WHEN p.direction='toward_fatiha' THEN (last_day.target_from->>'ayahIndex')::integer ELSE (last_day.target_to->>'ayahIndex')::integer END BETWEEN t.from_index AND t.to_index;
  IF cursor_no IS NULL THEN RAISE EXCEPTION 'آخر مقرر محفوظ خارج النطاق؛ يلزم إنشاء مراجعة جديدة.'; END IF;
 END IF;
 IF NOT p_append THEN
  DELETE FROM public.plan_days WHERE plan_id=p.id AND (keep_until IS NULL OR date_key>keep_until);
 END IF;
 FOR d IN SELECT g::date FROM generate_series(greatest(p.start_date,coalesce(keep_until+1,p.start_date)),least(p.end_date,p_through),interval '1 day') g
  WHERE NOT(extract(dow FROM g)::smallint=ANY(coalesce(p.excluded_weekdays,'{}'::smallint[]))) AND NOT(g::date=ANY(coalesce(p.excluded_dates,'{}'::date[]))) ORDER BY g
 LOOP
  IF cursor_no>total THEN cursor_no:=1;cycle:=cycle+1; END IF;
  amount:=least(greatest(1,p.daily_amount),total-cursor_no+1);
  SELECT min(t.from_index),max(t.to_index) INTO a,b FROM pg_temp._bounded_review_atoms t WHERE seq BETWEEN cursor_no AND cursor_no+amount-1;
  SELECT coalesce(jsonb_agg(s.value ORDER BY t.seq,s.ordinality),'[]'::jsonb) INTO seg FROM pg_temp._bounded_review_atoms t
   CROSS JOIN LATERAL jsonb_array_elements(private.quran_range_segments(t.from_index,t.to_index)) WITH ORDINALITY s(value,ordinality)
   WHERE t.seq BETWEEN cursor_no AND cursor_no+amount-1;
  INSERT INTO public.plan_days(plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments)
  VALUES(p.id,p.org_id,p.complex_id,p.circle_id,p.student_id,p.teacher_id,d,private.quran_target_ref(a,null,null),private.quran_target_ref(b,null,null),amount,'planned',p.created_by,p.created_by,cycle,seg);
  cursor_no:=cursor_no+amount;added:=added+1;
 END LOOP;
 UPDATE public.plans SET materialized_through=(SELECT max(date_key) FROM public.plan_days WHERE plan_id=p.id) WHERE id=p.id;
 RETURN jsonb_build_object('ok',true,'planId',p.id,'generatedDays',added,'cycles',cycle,'rangeFromJuz',first_juz,'rangeToJuz',last_juz);
END;
$fn$;
REVOKE ALL ON FUNCTION private.rebuild_bounded_major_review(text,date,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.rebuild_qpc_major_review_against_recent(p_plan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_plan public.plans%rowtype;
  v_recent public.plans%rowtype;
  v_last public.plan_days%rowtype;
  v_preserve_until date;
  v_start_idx integer;
  v_start_group integer;
  v_start_group_to integer;
  v_pair_lower integer;
  v_pair_upper integer;
  v_recent_end integer;
  v_lower integer;
  v_upper integer;
  v_min_group integer;
  v_max_group integer;
  v_cursor_group integer;
  v_cycle integer:=1;
  v_date date;
  v_generated integer:=0;
  v_selected integer;
  v_sel_min_group integer;
  v_sel_max_group integer;
  v_raw_from integer;
  v_raw_to integer;
  v_exact_from integer;
  v_exact_to integer;
  v_from_page integer;
  v_to_page integer;
  v_segments jsonb;
  v_start_mode text;
  v_auto_major boolean:=false;
  v_cycle_days integer:=5;
  v_daily_amount integer;
begin
  select * into v_plan from public.plans where id=p_plan_id for update;
  if not found or v_plan.type<>'review' then
    raise exception 'خطة المراجعة الكبرى غير موجودة.';
  end if;
  if v_plan.methodology_meta->>'reviewRangeMode'='juz' then
    return private.rebuild_bounded_major_review(p_plan_id,v_plan.end_date,false);
  end if;
  if v_plan.unit::text not in('quarter_hizb','half_hizb','hizb','juz') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','not_qpc_unit');
  end if;

  v_start_mode:=coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy');
  v_auto_major:=coalesce((v_plan.methodology_meta->>'autoMajor')::boolean,false);
  v_cycle_days:=greatest(1,least(30,coalesce(nullif(v_plan.methodology_meta->>'cycleDays','')::integer,5)));

  select * into v_recent
  from public.plans p
  where p.student_id=v_plan.student_id and p.status='active' and p.type='recent_review'
    and p.start_date<=v_plan.end_date and p.end_date>=v_plan.start_date
  order by p.updated_at desc,p.created_at desc limit 1;

  if v_recent.id is null then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','no_recent_review');
  end if;

  create temporary table if not exists _sanabil_qpc_groups(
    group_key integer primary key,
    from_index integer,
    to_index integer,
    from_page integer,
    to_page integer
  ) on commit drop;
  truncate _sanabil_qpc_groups;
  -- Keep future assignments in a transaction-local batch; persist once.
  create temporary table if not exists _sanabil_qpc_pending(
    date_key date primary key,
    from_index integer not null,
    to_index integer not null,
    units integer not null,
    cycle integer not null
  ) on commit drop;
  truncate _sanabil_qpc_pending;

  insert into _sanabil_qpc_groups(group_key,from_index,to_index,from_page,to_page)
  select
    case v_plan.unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no
    end,
    min(d.from_index)::integer,
    max(d.to_index)::integer,
    min(d.from_page)::integer,
    max(d.to_page)::integer
  from public.quran_divisions d
  group by 1;

  v_start_idx:=nullif(v_plan.start_ref->>'ayahIndex','')::integer;
  if v_start_idx is null then
    select q.ayah_index into v_start_idx
    from public.quran_ayahs q
    where q.surah_no=coalesce(nullif(v_plan.start_ref->>'surahNo','')::integer,nullif(v_plan.start_ref->>'surah','')::integer)
      and q.ayah_no=coalesce(nullif(v_plan.start_ref->>'ayahNo','')::integer,nullif(v_plan.start_ref->>'ayah','')::integer)
    limit 1;
  end if;

  select g.group_key,g.to_index into v_start_group,v_start_group_to
  from _sanabil_qpc_groups g
  where v_start_idx between g.from_index and g.to_index
  limit 1;

  if v_start_group is null then
    raise exception 'تعذر تحديد وحدة بداية المراجعة الكبرى.';
  end if;

  if v_plan.range_end_rub is not null then
    select d.from_index,d.to_index into v_pair_lower,v_pair_upper
    from public.quran_divisions d where d.rub_no=v_plan.range_end_rub;
  end if;

  select max(pd.date_key) into v_preserve_until
  from public.plan_days pd
  where pd.plan_id=v_plan.id
    and (
      pd.rating is not null or coalesce(pd.completed_amount,0)>0 or
      coalesce(pd.carry_in,0)>0 or coalesce(pd.carry_out,0)>0 or
      pd.status<>'planned' or pd.notes is not null
    );

  if v_preserve_until is not null then
    select * into v_last
    from public.plan_days pd
    where pd.plan_id=v_plan.id and pd.date_key=v_preserve_until
    order by pd.updated_at desc limit 1;

    v_cycle:=coalesce(v_last.cycle_no,1);
    if v_plan.direction='toward_fatiha'::public.plan_direction then
      select g.group_key-1 into v_cursor_group
      from _sanabil_qpc_groups g
      where (v_last.target_from->>'ayahIndex')::integer between g.from_index and g.to_index limit 1;
    else
      select g.group_key+1 into v_cursor_group
      from _sanabil_qpc_groups g
      where (v_last.target_to->>'ayahIndex')::integer between g.from_index and g.to_index limit 1;
    end if;
  end if;

  delete from public.plan_days pd
  where pd.plan_id=v_plan.id and (v_preserve_until is null or pd.date_key>v_preserve_until);

  for v_date in
    select d::date
    from generate_series(
      greatest(v_plan.start_date,coalesce(v_preserve_until+1,v_plan.start_date)),
      v_plan.end_date,
      interval '1 day'
    ) d
    where not(extract(dow from d)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
      and not(d::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
    order by d
  loop
    select nullif(pd.target_to->>'ayahIndex','')::integer
      into v_recent_end
    from public.plan_days pd
    where pd.plan_id=v_recent.id and pd.date_key<=v_date and pd.target_to is not null
    order by pd.date_key desc limit 1;

    if v_recent_end is null then continue; end if;

    -- التغطية الأساسية: تبدأ بعد المراجعة الصغرى مباشرة وتمتد إلى نهاية المحفوظ نحو الناس.
    v_lower:=least(6237,v_recent_end+1);
    v_upper:=6236;

    -- التوافق مع الخطط القديمة التي حددت حدًا صريحًا للمراجعة.
    if v_start_mode='legacy' then
      if v_plan.direction='toward_fatiha'::public.plan_direction then
        v_upper:=v_start_group_to;
        if v_pair_lower is not null then v_lower:=greatest(v_lower,v_pair_lower); end if;
      else
        if v_pair_upper is not null then v_upper:=least(v_upper,v_pair_upper); end if;
      end if;
    end if;

    if v_lower>v_upper then continue; end if;

    select min(g.group_key),max(g.group_key)
      into v_min_group,v_max_group
    from _sanabil_qpc_groups g
    where g.to_index>=v_lower and g.from_index<=v_upper;

    if v_min_group is null or v_max_group is null then continue; end if;

    if v_cursor_group is null then
      if v_start_mode='surah' and v_start_group between v_min_group and v_max_group then
        v_cursor_group:=v_start_group;
      else
        v_cursor_group:=case when v_plan.direction='toward_fatiha'::public.plan_direction
          then v_max_group else v_min_group end;
      end if;
    elsif v_cursor_group<v_min_group or v_cursor_group>v_max_group then
      v_cursor_group:=case when v_plan.direction='toward_fatiha'::public.plan_direction
        then v_max_group else v_min_group end;
      v_cycle:=v_cycle+1;
    end if;

    v_daily_amount:=greatest(1,coalesce(v_plan.daily_amount,1));
    if v_auto_major then
      v_daily_amount:=greatest(
        1,
        least(
          45,
          ceil((v_max_group-v_min_group+1)::numeric/v_cycle_days)::integer
        )
      );
    end if;

    if v_plan.direction='toward_fatiha'::public.plan_direction then
      select count(*)::integer,min(group_key),max(group_key),min(from_index),max(to_index)
        into v_selected,v_sel_min_group,v_sel_max_group,v_raw_from,v_raw_to
      from (
        select * from _sanabil_qpc_groups
        where group_key between v_min_group and v_max_group
          and group_key<=v_cursor_group
        order by group_key desc
        limit v_daily_amount
      ) x;
    else
      select count(*)::integer,min(group_key),max(group_key),min(from_index),max(to_index)
        into v_selected,v_sel_min_group,v_sel_max_group,v_raw_from,v_raw_to
      from (
        select * from _sanabil_qpc_groups
        where group_key between v_min_group and v_max_group
          and group_key>=v_cursor_group
        order by group_key asc
        limit v_daily_amount
      ) x;
    end if;

    if coalesce(v_selected,0)=0 then continue; end if;

    v_exact_from:=greatest(v_raw_from,v_lower);
    v_exact_to:=least(v_raw_to,v_upper);
    if v_exact_from>v_exact_to then continue; end if;
    -- The configured measure is a whole official division. Never label a
    -- clipped fragment as a full hizb/juz/half/quarter hizb. The incomplete
    -- boundary remains in the linked recent review instead.
    if v_exact_from>v_raw_from or v_exact_to<v_raw_to then
      continue;
    end if;

    insert into _sanabil_qpc_pending(date_key,from_index,to_index,units,cycle)
    values(v_date,v_exact_from,v_exact_to,v_selected,v_cycle);

    v_generated:=v_generated+1;
    if v_plan.direction='toward_fatiha'::public.plan_direction then
      v_cursor_group:=v_sel_min_group-1;
    else
      v_cursor_group:=v_sel_max_group+1;
    end if;
  end loop;

  -- Derive pages and Quran segments once per distinct passage, then write all
  -- future lessons in one INSERT. Completed and rated dates were never deleted.
  with unique_spans as materialized (
    select distinct from_index,to_index from _sanabil_qpc_pending
  ),
  passage_refs as materialized (
    select sp.from_index,sp.to_index,
      q_start.page_no::integer as from_page,
      q_end.page_no::integer as to_page,
      private.quran_range_segments(sp.from_index,sp.to_index) as segments
    from unique_spans sp
    join public.quran_ayahs q_start on q_start.ayah_index=sp.from_index
    join public.quran_ayahs q_end on q_end.ayah_index=sp.to_index
  )
  insert into public.plan_days(
    plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
    target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
  )
  select
    v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,
    pending.date_key,
    private.quran_target_ref(pending.from_index,refs.from_page,null),
    private.quran_target_ref(pending.to_index,refs.to_page,null),
    pending.units,'planned',v_actor,v_actor,pending.cycle,refs.segments
  from _sanabil_qpc_pending pending
  join passage_refs refs
    on refs.from_index=pending.from_index and refs.to_index=pending.to_index
  order by pending.date_key;

  return jsonb_build_object(
    'ok',true,'planId',v_plan.id,'recentReviewPlanId',v_recent.id,
    'generatedDays',v_generated,'preservedThrough',v_preserve_until,
    'reviewStartMode',v_start_mode,'autoMajor',v_auto_major,'cycleDays',v_cycle_days,
    'rule','major_review_starts_after_recent_and_covers_all_memorized_without_gap'
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION private.rebuild_linear_major_review_against_recent(p_plan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_plan public.plans%rowtype;
  v_recent public.plans%rowtype;
  v_preserve_until date;
  v_last public.plan_days%rowtype;
  v_start_mode text;
  v_auto_major boolean:=false;
  v_cycle_days integer:=5;
  v_start_idx integer;
  v_cursor_idx integer;
  v_recent_end integer;
  v_lower integer;
  v_upper integer:=6236;
  v_date date;
  v_cycle integer:=1;
  v_daily_amount integer;
  v_total_atoms integer;
  v_selected integer;
  v_from_idx integer;
  v_to_idx integer;
  v_from_page integer;
  v_to_page integer;
  v_from_line integer;
  v_to_line integer;
  v_segments jsonb;
  v_generated integer:=0;
  v_q public.quran_ayahs%rowtype;
begin
  select * into v_plan from public.plans where id=p_plan_id for update;
  if not found or v_plan.type<>'review' then
    raise exception 'خطة المراجعة الكبرى غير موجودة.';
  end if;
  if v_plan.methodology_meta->>'reviewRangeMode'='juz' then
    return private.rebuild_bounded_major_review(p_plan_id,v_plan.end_date,false);
  end if;
  if v_plan.unit::text not in('pages','ayahs','surahs') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','not_linear_unit');
  end if;

  v_start_mode:=coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy');
  if v_start_mode not in('lesson','surah') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','legacy_mode');
  end if;

  v_auto_major:=coalesce((v_plan.methodology_meta->>'autoMajor')::boolean,false);
  v_cycle_days:=greatest(1,least(30,coalesce(nullif(v_plan.methodology_meta->>'cycleDays','')::integer,5)));

  select * into v_recent
  from public.plans p
  where p.student_id=v_plan.student_id and p.status='active' and p.type='recent_review'
    and p.start_date<=v_plan.end_date and p.end_date>=v_plan.start_date
  order by p.updated_at desc,p.created_at desc limit 1;

  if v_recent.id is null then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','no_recent_review');
  end if;

  v_start_idx:=nullif(v_plan.start_ref->>'ayahIndex','')::integer;
  if v_start_idx is null then
    select q.ayah_index into v_start_idx
    from public.quran_ayahs q
    where q.surah_no=coalesce(nullif(v_plan.start_ref->>'surahNo','')::integer,nullif(v_plan.start_ref->>'surah','')::integer)
      and q.ayah_no=coalesce(nullif(v_plan.start_ref->>'ayahNo','')::integer,nullif(v_plan.start_ref->>'ayah','')::integer)
    limit 1;
  end if;

  select max(pd.date_key) into v_preserve_until
  from public.plan_days pd
  where pd.plan_id=v_plan.id
    and (
      pd.rating is not null or coalesce(pd.completed_amount,0)>0 or
      coalesce(pd.carry_in,0)>0 or coalesce(pd.carry_out,0)>0 or
      pd.status<>'planned' or pd.notes is not null
    );

  if v_preserve_until is not null then
    select * into v_last
    from public.plan_days pd
    where pd.plan_id=v_plan.id and pd.date_key=v_preserve_until
    order by pd.updated_at desc limit 1;
    v_cycle:=coalesce(v_last.cycle_no,1);
    v_cursor_idx:=coalesce(nullif(v_last.target_to->>'ayahIndex','')::integer,0)+1;
  end if;

  delete from public.plan_days pd
  where pd.plan_id=v_plan.id and (v_preserve_until is null or pd.date_key>v_preserve_until);

  create temporary table if not exists _sanabil_linear_review_atoms(
    seq integer primary key,
    atom_surah integer,
    from_index integer,
    to_index integer,
    from_page integer,
    to_page integer,
    from_line integer,
    to_line integer
  ) on commit drop;

  for v_date in
    select d::date
    from generate_series(
      greatest(v_plan.start_date,coalesce(v_preserve_until+1,v_plan.start_date)),
      v_plan.end_date,
      interval '1 day'
    ) d
    where not(extract(dow from d)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
      and not(d::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
    order by d
  loop
    select nullif(pd.target_to->>'ayahIndex','')::integer into v_recent_end
    from public.plan_days pd
    where pd.plan_id=v_recent.id and pd.date_key<=v_date and pd.target_to is not null
    order by pd.date_key desc limit 1;

    if v_recent_end is null then continue; end if;
    v_lower:=least(6237,v_recent_end+1);
    if v_lower>v_upper then continue; end if;

    if v_cursor_idx is null then
      if v_start_mode='surah' and v_start_idx between v_lower and v_upper then
        v_cursor_idx:=v_start_idx;
      else
        v_cursor_idx:=v_lower;
      end if;
    elsif v_cursor_idx<v_lower or v_cursor_idx>v_upper then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
    end if;

    select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
    if not found then
      v_cursor_idx:=v_lower;
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
    end if;

    truncate _sanabil_linear_review_atoms;
    insert into _sanabil_linear_review_atoms
    select * from private.quran_plan_atoms(
      v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
    );

    delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_cursor_idx;

    select count(*)::integer into v_total_atoms from _sanabil_linear_review_atoms;
    if coalesce(v_total_atoms,0)=0 then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
      continue;
    end if;

    v_daily_amount:=greatest(1,coalesce(v_plan.daily_amount,1));
    if v_auto_major then
      -- يحسب مقدار الدورة من كامل المسافة بعد المراجعة الصغرى، لا من موضع المؤشر فقط.
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_lower limit 1;
      truncate _sanabil_linear_review_atoms;
      insert into _sanabil_linear_review_atoms
      select * from private.quran_plan_atoms(
        v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
      );
      delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_lower;
      select count(*)::integer into v_total_atoms from _sanabil_linear_review_atoms;
      v_daily_amount:=greatest(1,least(45,ceil(v_total_atoms::numeric/v_cycle_days)::integer));

      -- أعد بناء الذرات من موضع المؤشر الحالي بعد حساب المقدار.
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
      truncate _sanabil_linear_review_atoms;
      insert into _sanabil_linear_review_atoms
      select * from private.quran_plan_atoms(
        v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
      );
      delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_cursor_idx;
    end if;

    select count(*)::integer,
           min(from_index)::integer,
           max(to_index)::integer,
           min(from_page)::integer,
           max(to_page)::integer,
           min(from_line)::integer,
           max(to_line)::integer
    into v_selected,v_from_idx,v_to_idx,v_from_page,v_to_page,v_from_line,v_to_line
    from (
      select * from _sanabil_linear_review_atoms order by seq limit v_daily_amount
    ) x;

    if coalesce(v_selected,0)=0 or v_from_idx is null or v_to_idx is null then continue; end if;
    v_from_idx:=greatest(v_from_idx,v_lower);
    v_to_idx:=least(v_to_idx,v_upper);
    v_segments:=private.quran_range_segments(v_from_idx,v_to_idx);

    insert into public.plan_days(
      plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
      target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
    ) values(
      v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,v_date,
      private.quran_target_ref(v_from_idx,v_from_page,v_from_line),
      private.quran_target_ref(v_to_idx,v_to_page,v_to_line),
      v_selected,'planned',v_actor,v_actor,v_cycle,v_segments
    );

    v_generated:=v_generated+1;
    v_cursor_idx:=v_to_idx+1;
    if v_cursor_idx>v_upper then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'planId',v_plan.id,'recentReviewPlanId',v_recent.id,
    'generatedDays',v_generated,'preservedThrough',v_preserve_until,
    'reviewStartMode',v_start_mode,'autoMajor',v_auto_major,'cycleDays',v_cycle_days,
    'rule','linear_major_review_starts_after_recent_and_covers_all_memorized'
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION private.horizon_append_qpc(p_plan_id text, p_through date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_plan public.plans%rowtype;
  v_recent public.plans%rowtype;
  v_last public.plan_days%rowtype;
  v_preserve_until date;
  v_start_idx integer;
  v_start_group integer;
  v_start_group_to integer;
  v_pair_lower integer;
  v_pair_upper integer;
  v_recent_end integer;
  v_lower integer;
  v_upper integer;
  v_min_group integer;
  v_max_group integer;
  v_cursor_group integer;
  v_cycle integer:=1;
  v_date date;
  v_generated integer:=0;
  v_selected integer;
  v_sel_min_group integer;
  v_sel_max_group integer;
  v_raw_from integer;
  v_raw_to integer;
  v_exact_from integer;
  v_exact_to integer;
  v_from_page integer;
  v_to_page integer;
  v_segments jsonb;
  v_start_mode text;
  v_auto_major boolean:=false;
  v_cycle_days integer:=5;
  v_daily_amount integer;
begin
  select * into v_plan from public.plans where id=p_plan_id for update;
  if not found or v_plan.type<>'review' then
    raise exception 'خطة المراجعة الكبرى غير موجودة.';
  end if;
  if v_plan.methodology_meta->>'reviewRangeMode'='juz' then
    return private.rebuild_bounded_major_review(p_plan_id,p_through,true);
  end if;
  if v_plan.unit::text not in('quarter_hizb','half_hizb','hizb','juz') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','not_qpc_unit');
  end if;

  v_start_mode:=coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy');
  v_auto_major:=coalesce((v_plan.methodology_meta->>'autoMajor')::boolean,false);
  v_cycle_days:=greatest(1,least(30,coalesce(nullif(v_plan.methodology_meta->>'cycleDays','')::integer,5)));

  select * into v_recent
  from public.plans p
  where p.student_id=v_plan.student_id and p.status='active' and p.type='recent_review'
    and p.start_date<=v_plan.end_date and p.end_date>=v_plan.start_date
  order by p.updated_at desc,p.created_at desc limit 1;

  if v_recent.id is null then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','no_recent_review');
  end if;

  create temporary table if not exists _sanabil_qpc_groups(
    group_key integer primary key,
    from_index integer,
    to_index integer,
    from_page integer,
    to_page integer
  ) on commit drop;
  truncate _sanabil_qpc_groups;
  -- Keep future assignments in a transaction-local batch; persist once.
  create temporary table if not exists _sanabil_qpc_pending(
    date_key date primary key,
    from_index integer not null,
    to_index integer not null,
    units integer not null,
    cycle integer not null
  ) on commit drop;
  truncate _sanabil_qpc_pending;

  insert into _sanabil_qpc_groups(group_key,from_index,to_index,from_page,to_page)
  select
    case v_plan.unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no
    end,
    min(d.from_index)::integer,
    max(d.to_index)::integer,
    min(d.from_page)::integer,
    max(d.to_page)::integer
  from public.quran_divisions d
  group by 1;

  v_start_idx:=nullif(v_plan.start_ref->>'ayahIndex','')::integer;
  if v_start_idx is null then
    select q.ayah_index into v_start_idx
    from public.quran_ayahs q
    where q.surah_no=coalesce(nullif(v_plan.start_ref->>'surahNo','')::integer,nullif(v_plan.start_ref->>'surah','')::integer)
      and q.ayah_no=coalesce(nullif(v_plan.start_ref->>'ayahNo','')::integer,nullif(v_plan.start_ref->>'ayah','')::integer)
    limit 1;
  end if;

  select g.group_key,g.to_index into v_start_group,v_start_group_to
  from _sanabil_qpc_groups g
  where v_start_idx between g.from_index and g.to_index
  limit 1;

  if v_start_group is null then
    raise exception 'تعذر تحديد وحدة بداية المراجعة الكبرى.';
  end if;

  if v_plan.range_end_rub is not null then
    select d.from_index,d.to_index into v_pair_lower,v_pair_upper
    from public.quran_divisions d where d.rub_no=v_plan.range_end_rub;
  end if;

  v_actor:=v_plan.created_by;
  select max(date_key) into v_preserve_until from public.plan_days where plan_id=v_plan.id;

  if v_preserve_until is not null then
    select * into v_last
    from public.plan_days pd
    where pd.plan_id=v_plan.id and pd.date_key=v_preserve_until
    order by pd.updated_at desc limit 1;

    v_cycle:=coalesce(v_last.cycle_no,1);
    if v_plan.direction='toward_fatiha'::public.plan_direction then
      select g.group_key-1 into v_cursor_group
      from _sanabil_qpc_groups g
      where (v_last.target_from->>'ayahIndex')::integer between g.from_index and g.to_index limit 1;
    else
      select g.group_key+1 into v_cursor_group
      from _sanabil_qpc_groups g
      where (v_last.target_to->>'ayahIndex')::integer between g.from_index and g.to_index limit 1;
    end if;
  end if;



  for v_date in
    select d::date
    from generate_series(
      greatest(v_plan.start_date,coalesce(v_preserve_until+1,v_plan.start_date)),
      least(v_plan.end_date,p_through),
      interval '1 day'
    ) d
    where not(extract(dow from d)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
      and not(d::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
    order by d
  loop
    select nullif(pd.target_to->>'ayahIndex','')::integer
      into v_recent_end
    from public.plan_days pd
    where pd.plan_id=v_recent.id and pd.date_key<=v_date and pd.target_to is not null
    order by pd.date_key desc limit 1;

    if v_recent_end is null then continue; end if;

    -- التغطية الأساسية: تبدأ بعد المراجعة الصغرى مباشرة وتمتد إلى نهاية المحفوظ نحو الناس.
    v_lower:=least(6237,v_recent_end+1);
    v_upper:=6236;

    -- التوافق مع الخطط القديمة التي حددت حدًا صريحًا للمراجعة.
    if v_start_mode='legacy' then
      if v_plan.direction='toward_fatiha'::public.plan_direction then
        v_upper:=v_start_group_to;
        if v_pair_lower is not null then v_lower:=greatest(v_lower,v_pair_lower); end if;
      else
        if v_pair_upper is not null then v_upper:=least(v_upper,v_pair_upper); end if;
      end if;
    end if;

    if v_lower>v_upper then continue; end if;

    select min(g.group_key),max(g.group_key)
      into v_min_group,v_max_group
    from _sanabil_qpc_groups g
    where g.to_index>=v_lower and g.from_index<=v_upper;

    if v_min_group is null or v_max_group is null then continue; end if;

    if v_cursor_group is null then
      if v_start_mode='surah' and v_start_group between v_min_group and v_max_group then
        v_cursor_group:=v_start_group;
      else
        v_cursor_group:=case when v_plan.direction='toward_fatiha'::public.plan_direction
          then v_max_group else v_min_group end;
      end if;
    elsif v_cursor_group<v_min_group or v_cursor_group>v_max_group then
      v_cursor_group:=case when v_plan.direction='toward_fatiha'::public.plan_direction
        then v_max_group else v_min_group end;
      v_cycle:=v_cycle+1;
    end if;

    v_daily_amount:=greatest(1,coalesce(v_plan.daily_amount,1));
    if v_auto_major then
      v_daily_amount:=greatest(
        1,
        least(
          45,
          ceil((v_max_group-v_min_group+1)::numeric/v_cycle_days)::integer
        )
      );
    end if;

    if v_plan.direction='toward_fatiha'::public.plan_direction then
      select count(*)::integer,min(group_key),max(group_key),min(from_index),max(to_index)
        into v_selected,v_sel_min_group,v_sel_max_group,v_raw_from,v_raw_to
      from (
        select * from _sanabil_qpc_groups
        where group_key between v_min_group and v_max_group
          and group_key<=v_cursor_group
        order by group_key desc
        limit v_daily_amount
      ) x;
    else
      select count(*)::integer,min(group_key),max(group_key),min(from_index),max(to_index)
        into v_selected,v_sel_min_group,v_sel_max_group,v_raw_from,v_raw_to
      from (
        select * from _sanabil_qpc_groups
        where group_key between v_min_group and v_max_group
          and group_key>=v_cursor_group
        order by group_key asc
        limit v_daily_amount
      ) x;
    end if;

    if coalesce(v_selected,0)=0 then continue; end if;

    v_exact_from:=greatest(v_raw_from,v_lower);
    v_exact_to:=least(v_raw_to,v_upper);
    if v_exact_from>v_exact_to then continue; end if;

    insert into _sanabil_qpc_pending(date_key,from_index,to_index,units,cycle)
    values(v_date,v_exact_from,v_exact_to,v_selected,v_cycle);

    v_generated:=v_generated+1;
    if v_plan.direction='toward_fatiha'::public.plan_direction then
      v_cursor_group:=v_sel_min_group-1;
    else
      v_cursor_group:=v_sel_max_group+1;
    end if;
  end loop;

  -- Derive pages and Quran segments once per distinct passage, then write all
  -- future lessons in one INSERT. Completed and rated dates were never deleted.
  with unique_spans as materialized (
    select distinct from_index,to_index from _sanabil_qpc_pending
  ),
  passage_refs as materialized (
    select sp.from_index,sp.to_index,
      q_start.page_no::integer as from_page,
      q_end.page_no::integer as to_page,
      private.quran_range_segments(sp.from_index,sp.to_index) as segments
    from unique_spans sp
    join public.quran_ayahs q_start on q_start.ayah_index=sp.from_index
    join public.quran_ayahs q_end on q_end.ayah_index=sp.to_index
  )
  insert into public.plan_days(
    plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
    target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
  )
  select
    v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,
    pending.date_key,
    private.quran_target_ref(pending.from_index,refs.from_page,null),
    private.quran_target_ref(pending.to_index,refs.to_page,null),
    pending.units,'planned',v_actor,v_actor,pending.cycle,refs.segments
  from _sanabil_qpc_pending pending
  join passage_refs refs
    on refs.from_index=pending.from_index and refs.to_index=pending.to_index
  order by pending.date_key;

  return jsonb_build_object(
    'ok',true,'planId',v_plan.id,'recentReviewPlanId',v_recent.id,
    'generatedDays',v_generated,'preservedThrough',v_preserve_until,
    'reviewStartMode',v_start_mode,'autoMajor',v_auto_major,'cycleDays',v_cycle_days,
    'rule','major_review_starts_after_recent_and_covers_all_memorized_without_gap'
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION private.horizon_append_linear(p_plan_id text, p_through date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_plan public.plans%rowtype;
  v_recent public.plans%rowtype;
  v_preserve_until date;
  v_last public.plan_days%rowtype;
  v_start_mode text;
  v_auto_major boolean:=false;
  v_cycle_days integer:=5;
  v_start_idx integer;
  v_cursor_idx integer;
  v_recent_end integer;
  v_lower integer;
  v_upper integer:=6236;
  v_date date;
  v_cycle integer:=1;
  v_daily_amount integer;
  v_total_atoms integer;
  v_selected integer;
  v_from_idx integer;
  v_to_idx integer;
  v_from_page integer;
  v_to_page integer;
  v_from_line integer;
  v_to_line integer;
  v_segments jsonb;
  v_generated integer:=0;
  v_q public.quran_ayahs%rowtype;
begin
  select * into v_plan from public.plans where id=p_plan_id for update;
  if not found or v_plan.type<>'review' then
    raise exception 'خطة المراجعة الكبرى غير موجودة.';
  end if;
  if v_plan.methodology_meta->>'reviewRangeMode'='juz' then
    return private.rebuild_bounded_major_review(p_plan_id,p_through,true);
  end if;
  if v_plan.unit::text not in('pages','ayahs','surahs') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','not_linear_unit');
  end if;

  v_start_mode:=coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy');
  if v_start_mode not in('lesson','surah') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','legacy_mode');
  end if;

  v_auto_major:=coalesce((v_plan.methodology_meta->>'autoMajor')::boolean,false);
  v_cycle_days:=greatest(1,least(30,coalesce(nullif(v_plan.methodology_meta->>'cycleDays','')::integer,5)));

  select * into v_recent
  from public.plans p
  where p.student_id=v_plan.student_id and p.status='active' and p.type='recent_review'
    and p.start_date<=v_plan.end_date and p.end_date>=v_plan.start_date
  order by p.updated_at desc,p.created_at desc limit 1;

  if v_recent.id is null then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','no_recent_review');
  end if;

  v_start_idx:=nullif(v_plan.start_ref->>'ayahIndex','')::integer;
  if v_start_idx is null then
    select q.ayah_index into v_start_idx
    from public.quran_ayahs q
    where q.surah_no=coalesce(nullif(v_plan.start_ref->>'surahNo','')::integer,nullif(v_plan.start_ref->>'surah','')::integer)
      and q.ayah_no=coalesce(nullif(v_plan.start_ref->>'ayahNo','')::integer,nullif(v_plan.start_ref->>'ayah','')::integer)
    limit 1;
  end if;

  v_actor:=v_plan.created_by;
  select max(date_key) into v_preserve_until from public.plan_days where plan_id=v_plan.id;

  if v_preserve_until is not null then
    select * into v_last
    from public.plan_days pd
    where pd.plan_id=v_plan.id and pd.date_key=v_preserve_until
    order by pd.updated_at desc limit 1;
    v_cycle:=coalesce(v_last.cycle_no,1);
    v_cursor_idx:=coalesce(nullif(v_last.target_to->>'ayahIndex','')::integer,0)+1;
  end if;



  create temporary table if not exists _sanabil_linear_review_atoms(
    seq integer primary key,
    atom_surah integer,
    from_index integer,
    to_index integer,
    from_page integer,
    to_page integer,
    from_line integer,
    to_line integer
  ) on commit drop;

  for v_date in
    select d::date
    from generate_series(
      greatest(v_plan.start_date,coalesce(v_preserve_until+1,v_plan.start_date)),
      least(v_plan.end_date,p_through),
      interval '1 day'
    ) d
    where not(extract(dow from d)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
      and not(d::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
    order by d
  loop
    select nullif(pd.target_to->>'ayahIndex','')::integer into v_recent_end
    from public.plan_days pd
    where pd.plan_id=v_recent.id and pd.date_key<=v_date and pd.target_to is not null
    order by pd.date_key desc limit 1;

    if v_recent_end is null then continue; end if;
    v_lower:=least(6237,v_recent_end+1);
    if v_lower>v_upper then continue; end if;

    if v_cursor_idx is null then
      if v_start_mode='surah' and v_start_idx between v_lower and v_upper then
        v_cursor_idx:=v_start_idx;
      else
        v_cursor_idx:=v_lower;
      end if;
    elsif v_cursor_idx<v_lower or v_cursor_idx>v_upper then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
    end if;

    select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
    if not found then
      v_cursor_idx:=v_lower;
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
    end if;

    truncate _sanabil_linear_review_atoms;
    insert into _sanabil_linear_review_atoms
    select * from private.quran_plan_atoms(
      v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
    );

    delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_cursor_idx;

    select count(*)::integer into v_total_atoms from _sanabil_linear_review_atoms;
    if coalesce(v_total_atoms,0)=0 then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
      continue;
    end if;

    v_daily_amount:=greatest(1,coalesce(v_plan.daily_amount,1));
    if v_auto_major then
      -- يحسب مقدار الدورة من كامل المسافة بعد المراجعة الصغرى، لا من موضع المؤشر فقط.
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_lower limit 1;
      truncate _sanabil_linear_review_atoms;
      insert into _sanabil_linear_review_atoms
      select * from private.quran_plan_atoms(
        v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
      );
      delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_lower;
      select count(*)::integer into v_total_atoms from _sanabil_linear_review_atoms;
      v_daily_amount:=greatest(1,least(45,ceil(v_total_atoms::numeric/v_cycle_days)::integer));

      -- أعد بناء الذرات من موضع المؤشر الحالي بعد حساب المقدار.
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
      truncate _sanabil_linear_review_atoms;
      insert into _sanabil_linear_review_atoms
      select * from private.quran_plan_atoms(
        v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
      );
      delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_cursor_idx;
    end if;

    select count(*)::integer,
           min(from_index)::integer,
           max(to_index)::integer,
           min(from_page)::integer,
           max(to_page)::integer,
           min(from_line)::integer,
           max(to_line)::integer
    into v_selected,v_from_idx,v_to_idx,v_from_page,v_to_page,v_from_line,v_to_line
    from (
      select * from _sanabil_linear_review_atoms order by seq limit v_daily_amount
    ) x;

    if coalesce(v_selected,0)=0 or v_from_idx is null or v_to_idx is null then continue; end if;
    v_from_idx:=greatest(v_from_idx,v_lower);
    v_to_idx:=least(v_to_idx,v_upper);
    v_segments:=private.quran_range_segments(v_from_idx,v_to_idx);

    insert into public.plan_days(
      plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
      target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
    ) values(
      v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,v_date,
      private.quran_target_ref(v_from_idx,v_from_page,v_from_line),
      private.quran_target_ref(v_to_idx,v_to_page,v_to_line),
      v_selected,'planned',v_actor,v_actor,v_cycle,v_segments
    );

    v_generated:=v_generated+1;
    v_cursor_idx:=v_to_idx+1;
    if v_cursor_idx>v_upper then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'planId',v_plan.id,'recentReviewPlanId',v_recent.id,
    'generatedDays',v_generated,'preservedThrough',v_preserve_until,
    'reviewStartMode',v_start_mode,'autoMajor',v_auto_major,'cycleDays',v_cycle_days,
    'rule','linear_major_review_starts_after_recent_and_covers_all_memorized'
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION public.save_plan_bundle(p_student_id text, p_teacher_id text, p_start_date date, p_end_date date, p_excluded_weekdays smallint[], p_tracks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

  if v_active_review_count=2 and not exists(select 1 from public.plans where student_id=p_student_id and status='active' and type='review' and methodology_meta->>'reviewRangeMode'='juz') then
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
COMMIT;
