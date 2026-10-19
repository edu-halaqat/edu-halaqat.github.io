-- Student incentive points: derived from persisted attendance/outcomes, no changes to historic grades.
-- Policies are versioned by date to prevent retroactive reclassification.
create table if not exists public.student_scoring_policies (
  complex_id text not null references public.complexes(id) on delete cascade,
  effective_from date not null,
  rules jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  primary key (complex_id,effective_from),
  constraint scoring_policy_object check (jsonb_typeof(rules)='object')
);
create table if not exists public.student_scoring_periods (
  complex_id text not null references public.complexes(id) on delete cascade,
  period_type text not null check(period_type in ('term','custom')),
  label text not null,
  start_date date not null,
  end_date date not null,
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key(complex_id,period_type),
  check(start_date<=end_date),
  check(end_date-start_date<=730)
);
create table if not exists public.student_daily_points (
  student_id text not null references public.students(id) on delete cascade,
  date_key date not null,
  org_id text not null,
  complex_id text not null,
  circle_id text not null,
  attendance_status text,
  attendance_points smallint not null default 0 check(attendance_points between 0 and 5),
  memorization_points smallint not null default 0 check(memorization_points between 0 and 5),
  recent_review_points smallint not null default 0 check(recent_review_points between 0 and 5),
  review_points smallint not null default 0 check(review_points between 0 and 10),
  total_points smallint generated always as
    (attendance_points+memorization_points+recent_review_points+review_points) stored,
  policy_effective_from date,
  calculated_at timestamptz not null default now(),
  primary key(student_id,date_key)
);
create index if not exists idx_student_daily_points_complex_date
  on public.student_daily_points(complex_id,date_key,circle_id);
create index if not exists idx_student_daily_points_circle_date
  on public.student_daily_points(circle_id,date_key,student_id);

alter table public.student_scoring_policies enable row level security;
alter table public.student_scoring_periods enable row level security;
alter table public.student_daily_points enable row level security;
revoke all on public.student_scoring_policies,public.student_scoring_periods,public.student_daily_points from anon,authenticated;
grant select on public.student_scoring_policies,public.student_scoring_periods,public.student_daily_points to authenticated;
drop policy if exists "scoring membership read" on public.student_scoring_policies;
create policy "scoring membership read" on public.student_scoring_policies for select to authenticated
using (exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active and
 (m.role::text='admin' and m.org_id=(select org_id from public.complexes c where c.id=complex_id)
  or m.role::text in ('manager','supervisor','teacher') and m.complex_id=complex_id)));
drop policy if exists "score period membership read" on public.student_scoring_periods;
create policy "score period membership read" on public.student_scoring_periods for select to authenticated
using (exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active and
 (m.role::text='admin' and m.org_id=(select org_id from public.complexes c where c.id=complex_id)
  or m.role::text in ('manager','supervisor','teacher') and m.complex_id=complex_id)));
drop policy if exists "score daily membership read" on public.student_daily_points;
create policy "score daily membership read" on public.student_daily_points for select to authenticated
using (exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active and
 ((m.role::text='admin' and m.org_id=student_daily_points.org_id)
  or (m.role::text in ('manager','supervisor') and m.complex_id=student_daily_points.complex_id)
  or (m.role::text='teacher' and m.circle_id=student_daily_points.circle_id))));

create or replace function public.student_scoring_defaults() returns jsonb
language sql immutable set search_path='' as $$
 select '{"tracks":{"memorization":{"error_weight":1,"doubt_weight":1,"excellent_max":0,"very_good_max":0,"good_max":0},"recentReview":{"error_weight":1,"doubt_weight":1,"excellent_max":0,"very_good_max":0,"good_max":0},"review":{"error_weight":2,"doubt_weight":1,"excellent_max":1,"very_good_max":2,"good_max":5}}}'::jsonb
$$;
create or replace function public.student_scoring_rules_for(p_complex_id text,p_date date)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select rules from public.student_scoring_policies
   where complex_id=p_complex_id and effective_from<=p_date
   order by effective_from desc limit 1),public.student_scoring_defaults())
$$;
create or replace function public.get_student_scoring_policy(p_complex_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org text; v_when date; v_rules jsonb;
begin
 select org_id into v_org from public.complexes where id=p_complex_id;
 if v_org is null or not exists(
  select 1 from public.memberships m where m.user_id=auth.uid() and m.active
  and ((m.role::text='admin' and m.org_id=v_org)
    or (m.role::text in ('manager','supervisor','teacher') and m.complex_id=p_complex_id))
 ) then raise exception 'غير مصرح بالاطلاع على إعدادات هذا المجمع' using errcode='42501'; end if;
 select effective_from,rules into v_when,v_rules from public.student_scoring_policies
 where complex_id=p_complex_id and effective_from<=current_date
 order by effective_from desc limit 1;
 return jsonb_build_object('rules',coalesce(v_rules,public.student_scoring_defaults()),'effective_from',v_when);
end $$;
create or replace function public.set_student_scoring_policy(p_complex_id text,p_rules jsonb,p_effective_from date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org text; t text; x jsonb; e int; d int; a int; b int; c int;
begin
 select org_id into v_org from public.complexes where id=p_complex_id;
 if v_org is null or not exists(
  select 1 from public.memberships m where m.user_id=auth.uid() and m.active
  and ((m.role::text='admin' and m.org_id=v_org)
    or (m.role::text in ('manager','supervisor') and m.complex_id=p_complex_id))
 ) then raise exception 'لا تملك صلاحية تعديل قواعد المجمع' using errcode='42501'; end if;
 if p_effective_from is null or p_effective_from<=current_date or p_effective_from>current_date+365
 then raise exception 'يجب أن تسري التعديلات من يوم مستقبلي خلال سنة'; end if;
 if jsonb_typeof(p_rules) <> 'object' or jsonb_typeof(p_rules->'tracks') <> 'object'
 then raise exception 'إعدادات غير صالحة'; end if;
 for t in select unnest(array['memorization','recentReview','review']) loop
  x:=p_rules->'tracks'->t;
  if jsonb_typeof(x)<>'object' or (select count(*) from jsonb_object_keys(x))<>5
     or not (x ?& array['error_weight','doubt_weight','excellent_max','very_good_max','good_max'])
     or exists(select 1 from jsonb_each_text(x) v where v.value !~ '^[0-9]{1,3}$')
  then raise exception 'كل عنصر يحتاج خمسة أعداد صحيحة فقط'; end if;
  e:=(x->>'error_weight')::int;d:=(x->>'doubt_weight')::int;
  a:=(x->>'excellent_max')::int;b:=(x->>'very_good_max')::int;c:=(x->>'good_max')::int;
  if e<1 or e>10 or d<1 or d>10 or a<0 or a>30 or b<a or b>30 or c<b or c>50
  then raise exception 'أوزان أو حدود التقدير غير متسقة'; end if;
 end loop;
 insert into public.student_scoring_policies(complex_id,effective_from,rules,created_by)
 values(p_complex_id,p_effective_from,p_rules,auth.uid())
 on conflict(complex_id,effective_from) do update set rules=excluded.rules,created_by=excluded.created_by,created_at=now();
 return jsonb_build_object('ok',true,'effective_from',p_effective_from);
end $$;
create or replace function public.set_student_scoring_period(
 p_complex_id text,p_period_type text,p_label text,p_start_date date,p_end_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org text;
begin
 select org_id into v_org from public.complexes where id=p_complex_id;
 if v_org is null or not exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active
 and ((m.role::text='admin' and m.org_id=v_org) or
      (m.role::text in ('manager','supervisor') and m.complex_id=p_complex_id)))
 then raise exception 'غير مخول بتحديد فترة المجمع' using errcode='42501'; end if;
 if p_period_type not in ('term','custom') or length(trim(p_label)) not between 2 and 70
    or p_start_date is null or p_end_date is null or p_start_date>p_end_date
    or p_end_date-p_start_date>730
 then raise exception 'حدد اسم الفترة وتواريخ صحيحة (أقصى مدة سنتان)';end if;
 insert into public.student_scoring_periods(complex_id,period_type,label,start_date,end_date,updated_by)
 values(p_complex_id,p_period_type,trim(p_label),p_start_date,p_end_date,auth.uid())
 on conflict(complex_id,period_type) do update set label=excluded.label,start_date=excluded.start_date,
 end_date=excluded.end_date,updated_by=excluded.updated_by,updated_at=now();
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.student_rating_points(p_rating text,p_track text)
returns smallint language sql immutable set search_path='' as $$
 select case when p_track='review' then
  case trim(coalesce(p_rating,'')) when 'ممتاز' then 10
    when 'جيد جدًا' then 7 when 'جيد جداً' then 7 when 'جيد جدا' then 7
    when 'جيد' then 4 else 0 end
 else case trim(coalesce(p_rating,'')) when 'ممتاز' then 5
    when 'جيد جدًا' then 3 when 'جيد جداً' then 3 when 'جيد جدا' then 3 else 0 end
 end::smallint
$$;
create or replace function public.recompute_student_daily_points(p_student_id text,p_date date)
returns void language plpgsql security definer set search_path='' as $$
declare st record; att text; v_out record; major text; eff date;
begin
 select id,org_id,complex_id,circle_id,active into st from public.students where id=p_student_id;
 if st.id is null then return;end if;
 select a.status into att from public.student_attendance a where a.student_id=p_student_id and a.date_key=p_date limit 1;
 select oc.id,oc.memorization_rating,oc.recent_review_rating,oc.review_rating
 into v_out from public.outcomes oc where oc.student_id=p_student_id and oc.date_key=p_date limit 1;
 if att is null and v_out.id is null then
   delete from public.student_daily_points where student_id=p_student_id and date_key=p_date;return;
 end if;
 if exists(select 1 from public.student_day_types d where d.student_id=p_student_id and d.date_key=p_date and d.day_type in ('holiday','unaccounted'))
 or exists(select 1 from public.circle_day_types d where d.circle_id=st.circle_id and d.date_key=p_date and d.day_type in ('holiday','unaccounted')) then
   delete from public.student_daily_points where student_id=p_student_id and date_key=p_date;return;
 end if;
 major:=nullif(v_out.review_rating,'');
 if major is null and v_out.id is not null then
  select pd.rating into major from public.plan_days pd
  join public.plans p on p.id=pd.plan_id
  where pd.student_id=p_student_id and pd.date_key=p_date
    and p.type in ('review','major_review') and nullif(pd.rating,'') is not null
  order by case trim(pd.rating) when 'لم يحفظ' then 0 when 'لم يسمع' then 0
    when 'جيد' then 1 when 'جيد جدًا' then 2 when 'جيد جداً' then 2
    when 'ممتاز' then 3 else 0 end asc limit 1;
 end if;
 select effective_from into eff from public.student_scoring_policies
 where complex_id=st.complex_id and effective_from<=p_date
 order by effective_from desc limit 1;
 insert into public.student_daily_points
  (student_id,date_key,org_id,complex_id,circle_id,attendance_status,
   attendance_points,memorization_points,recent_review_points,review_points,policy_effective_from)
 values (p_student_id,p_date,st.org_id,st.complex_id,st.circle_id,att,
    case att when 'present' then 5 when 'late' then 3 when 'excused' then 3 else 0 end,
    case when att='absent' then 0 else public.student_rating_points(v_out.memorization_rating,'memorization') end,
    case when att='absent' then 0 else public.student_rating_points(v_out.recent_review_rating,'recentReview') end,
    case when att='absent' then 0 else public.student_rating_points(major,'review') end,eff)
 on conflict(student_id,date_key) do update set
   org_id=excluded.org_id,complex_id=excluded.complex_id,circle_id=excluded.circle_id,
   attendance_status=excluded.attendance_status,attendance_points=excluded.attendance_points,
   memorization_points=excluded.memorization_points,recent_review_points=excluded.recent_review_points,
   review_points=excluded.review_points,policy_effective_from=excluded.policy_effective_from,
   calculated_at=now();
end $$;
create or replace function public.update_student_points_on_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform public.recompute_student_daily_points(old.student_id,old.date_key);
 else
  if tg_op='UPDATE' and (old.student_id is distinct from new.student_id or old.date_key is distinct from new.date_key)
  then perform public.recompute_student_daily_points(old.student_id,old.date_key);end if;
  perform public.recompute_student_daily_points(new.student_id,new.date_key);
 end if;
 return null;
end $$;
drop trigger if exists student_points_from_attendance on public.student_attendance;
create trigger student_points_from_attendance after insert or update or delete on public.student_attendance
for each row execute function public.update_student_points_on_change();
drop trigger if exists student_points_from_outcomes on public.outcomes;
create trigger student_points_from_outcomes after insert or update or delete on public.outcomes
for each row execute function public.update_student_points_on_change();
drop trigger if exists student_points_from_plan_grade on public.plan_days;
create trigger student_points_from_plan_grade after update of rating on public.plan_days
for each row when (old.rating is distinct from new.rating)
execute function public.update_student_points_on_change();

-- Service-role only: called by the already token-authenticated guardian Edge Function.
-- Never expose other students' identities or individual points in a family response.
create or replace function public.guardian_student_points_report(p_student_id text,p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s record; payload jsonb; v_start date; v_end date;
begin
 if p_student_id is null then raise exception 'missing student';end if;
 v_start:=p_start;v_end:=p_end;
 if v_start is null or v_end is null or v_start>v_end or v_end-v_start>730
 then raise exception 'invalid score date range';end if;
 select id,circle_id,complex_id into s from public.students where id=p_student_id and active;
 if s.id is null then raise exception 'student not available';end if;
 with totals as (
   select st.id,st.circle_id,coalesce(sum(d.total_points),0)::int as points
   from public.students st left join public.student_daily_points d
    on d.student_id=st.id and d.date_key between v_start and v_end
   where st.complex_id=s.complex_id and st.active
   group by st.id,st.circle_id
 ), ranks as (
   select id,points,
    rank() over(partition by circle_id order by points desc) as circle_rank,
    count(*) over(partition by circle_id) as circle_count,
    rank() over(order by points desc) as complex_rank,
    count(*) over() as complex_count
   from totals
 )
 select jsonb_build_object('total',r.points,'circleRank',r.circle_rank,
  'circleCount',r.circle_count,'complexRank',r.complex_rank,'complexCount',r.complex_count)
 into payload from ranks r where r.id=s.id;
 return coalesce(payload,'{}'::jsonb)||
 jsonb_build_object('from',v_start,'to',v_end,'days',
   coalesce((select jsonb_agg(jsonb_build_object('date',d.date_key,'attendance',d.attendance_points,
     'memorization',d.memorization_points,'recentReview',d.recent_review_points,
     'review',d.review_points,'total',d.total_points) order by d.date_key desc)
     from public.student_daily_points d
     where d.student_id=s.id and d.date_key between v_start and v_end),'[]'::jsonb));
end $$;
revoke execute on function public.guardian_student_points_report(text,date,date) from public,anon,authenticated;
grant execute on function public.guardian_student_points_report(text,date,date) to service_role;
revoke execute on function public.student_scoring_rules_for(text,date),public.recompute_student_daily_points(text,date)
from public,anon,authenticated;
grant execute on function public.get_student_scoring_policy(text),public.set_student_scoring_policy(text,jsonb,date),
 public.set_student_scoring_period(text,text,text,date,date) to authenticated;
-- Historic scoring backfill is derived only; source attendance, outcomes and plan grades remain unchanged.
do $$
declare row record;
begin
 for row in (select student_id,date_key from public.outcomes
   union select student_id,date_key from public.student_attendance) loop
  perform public.recompute_student_daily_points(row.student_id,row.date_key);
 end loop;
end $$;
