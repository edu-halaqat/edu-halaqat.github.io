-- Faster Quran daily assignment rescheduling: batch QPC days and avoid duplicate major review rebuilds.
-- Preserve all previously completed, rated or otherwise protected dates.
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

CREATE OR REPLACE FUNCTION public.sync_student_review_plans(p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student public.students%rowtype;
  v_count integer;
  r record;
begin
  if (select auth.uid()) is null or not private.active_user() then
    raise exception 'يلزم تسجيل الدخول بحساب نشط.' using errcode='42501';
  end if;

  select * into v_student from public.students where id=p_student_id and active;
  if not found then raise exception 'الطالب غير موجود أو غير نشط.'; end if;

  if not private.can_access(
    v_student.org_id,v_student.complex_id,v_student.circle_id,
    array['admin','manager','supervisor','teacher']::public.app_role[]
  ) then
    raise exception 'لا تملك صلاحية مزامنة خطط هذا الطالب.' using errcode='42501';
  end if;

  perform private.sync_recent_review_for_student(p_student_id);

  for r in
    select id,unit,methodology_meta
    from public.plans
    where student_id=p_student_id and type='review' and status='active'
  loop
    -- The preceding private.sync_recent_review_for_student already
    -- rebuilds QPC major reviews once after it refreshes recent reviews.
    if r.unit::text in('quarter_hizb','half_hizb','hizb','juz') then
      null;
    elsif r.unit::text in('pages','ayahs','surahs')
      and coalesce(r.methodology_meta->>'reviewStartMode','legacy') in('lesson','surah') then
      perform private.rebuild_linear_major_review_against_recent(r.id);
    end if;
  end loop;

  select count(*) into v_count
  from public.plans
  where student_id=p_student_id and status='active'
    and type in('recent_review','review');

  return jsonb_build_object('ok',true,'studentId',p_student_id,'syncedPlans',v_count);
end;
$function$
;
