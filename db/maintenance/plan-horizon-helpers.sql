-- Internal append-only helpers. Installation does not activate trimming or cron.
BEGIN;
CREATE OR REPLACE FUNCTION private.horizon_append_memorization(p_plan_id text,p_through date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 p public.plans%rowtype; last_day public.plan_days%rowtype;
 anchor integer; seq integer; d date; c record; added integer:=0; n integer;
BEGIN
 IF p_through IS NULL THEN RAISE EXCEPTION 'A target date is required'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND OR p.type<>'memorization' OR p.unit::text<>'lines' OR p.status<>'active'
   OR coalesce(p.cycle_enabled,false) THEN RAISE EXCEPTION 'Unsupported memorization plan'; END IF;
 SELECT * INTO last_day FROM public.plan_days WHERE plan_id=p.id ORDER BY date_key DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing continuation anchor'; END IF;
 IF last_day.date_key>=least(p_through,p.end_date) THEN RETURN 0; END IF;
 CREATE TEMP TABLE IF NOT EXISTS _horizon_chunks(
   day_seq integer primary key,from_index integer,to_index integer,
   from_page integer,to_page integer,from_line integer,to_line integer,actual_lines integer
 ) ON COMMIT DROP;
 TRUNCATE _horizon_chunks;
 IF coalesce((p.methodology_meta->>'dynamicLevels')::boolean,false) THEN
   IF p.methodology_code NOT IN ('bir_alwalidayn','aqom') OR p.direction::text<>'toward_fatiha' THEN
     RAISE EXCEPTION 'Unsupported dynamic methodology';
   END IF;
   INSERT INTO _horizon_chunks
   SELECT day_seq,from_index,to_index,from_page,to_page,from_line,to_line,actual_lines
   FROM private.quran_methodology_line_chunks(
     (p.start_ref->>'surahNo')::integer,(p.start_ref->>'ayahNo')::integer,
     p.methodology_code,p.methodology_meta->>'path',p.methodology_profile);
 ELSE
   INSERT INTO _horizon_chunks SELECT * FROM private.quran_memorization_line_chunks(
     (p.start_ref->>'surahNo')::integer,(p.start_ref->>'ayahNo')::integer,p.direction,p.daily_amount);
 END IF;
 SELECT day_seq INTO anchor FROM _horizon_chunks
 WHERE from_index=(last_day.target_from->>'ayahIndex')::integer
   AND to_index=(last_day.target_to->>'ayahIndex')::integer AND actual_lines=last_day.target_amount;
 IF anchor IS NULL THEN RAISE EXCEPTION 'Anchor differs from canonical curriculum; manual review required'; END IF;
 seq:=anchor;
 FOR d IN SELECT g::date FROM generate_series(last_day.date_key+1,least(p_through,p.end_date),interval '1 day') g
   WHERE NOT(extract(dow from g)::smallint=any(coalesce(p.excluded_weekdays,'{}'::smallint[])))
     AND NOT(g::date=any(coalesce(p.excluded_dates,'{}'::date[]))) ORDER BY g
 LOOP
   seq:=seq+1;
   SELECT * INTO c FROM _horizon_chunks WHERE day_seq=seq;
   EXIT WHEN NOT FOUND;
   INSERT INTO public.plan_days(plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
     target_from,target_to,target_amount,completed_amount,carry_in,carry_out,status,created_by,updated_by,cycle_no,segments)
   VALUES(p.id,p.org_id,p.complex_id,p.circle_id,p.student_id,p.teacher_id,d,
     private.quran_target_ref(c.from_index,c.from_page,c.from_line),
     private.quran_target_ref(c.to_index,c.to_page,c.to_line),c.actual_lines,0,0,0,'planned',p.created_by,p.created_by,1,
     private.quran_range_segments(c.from_index,c.to_index))
   ON CONFLICT(plan_id,date_key) DO NOTHING;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>1 THEN RAISE EXCEPTION 'Unexpected concurrent day; retry the student'; END IF;
   added:=added+n;
 END LOOP;
 IF added>0 THEN UPDATE public.plans SET materialized_through=(SELECT max(date_key) FROM public.plan_days WHERE plan_id=p.id) WHERE id=p.id; END IF;
 RETURN added;
END;
$fn$;


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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION private.horizon_append_recent(p_recent_id text,p_mem_id text,p_from_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE p public.plans%rowtype; m public.plans%rowtype; d record; w record; added integer:=0; n integer; last_date date;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_recent_id FOR UPDATE;
 SELECT * INTO m FROM public.plans WHERE id=p_mem_id FOR UPDATE;
 IF p.id IS NULL OR m.id IS NULL OR p.type<>'recent_review' OR m.type<>'memorization'
   OR p.student_id<>m.student_id OR p.linked_plan_id IS DISTINCT FROM m.id
   OR p.unit::text NOT IN ('pages','ayahs','surahs') THEN RAISE EXCEPTION 'Unsupported recent review relationship'; END IF;
 SELECT max(date_key) INTO last_date FROM public.plan_days WHERE plan_id=p.id;
 FOR d IN SELECT * FROM public.plan_days WHERE plan_id=m.id AND date_key BETWEEN p.start_date AND p.end_date
   AND date_key>=coalesce(p_from_date,p.start_date) AND (last_date IS NULL OR date_key>last_date) ORDER BY date_key
 LOOP
   SELECT * INTO w FROM private.recent_review_window((d.target_to->>'ayahIndex')::integer,p.unit,p.daily_amount);
   IF w.start_index IS NULL THEN RAISE EXCEPTION 'No recent review window'; END IF;
   INSERT INTO public.plan_days(plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
     target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments)
   VALUES(p.id,p.org_id,p.complex_id,p.circle_id,p.student_id,p.teacher_id,d.date_key,
     private.quran_target_ref(w.start_index,null,null),private.quran_target_ref(w.end_index,null,null),
     w.actual_amount,'planned',p.created_by,p.created_by,1,private.quran_range_segments(w.start_index,w.end_index))
   ON CONFLICT(plan_id,date_key) DO NOTHING;
   GET DIAGNOSTICS n=ROW_COUNT;
   added:=added+n;
 END LOOP;
 RETURN jsonb_build_object('generatedDays',added);
END;
$fn$;

REVOKE ALL ON FUNCTION private.horizon_append_memorization(text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.horizon_append_recent(text,text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.horizon_append_qpc(text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.horizon_append_linear(text,date) FROM PUBLIC,anon,authenticated;
COMMIT;
