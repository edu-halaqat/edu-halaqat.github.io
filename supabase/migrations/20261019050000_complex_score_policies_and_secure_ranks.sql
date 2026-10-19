-- Scoring is derived from confirmed attendance and outcomes, never written by the teacher.
-- Policy versions affect future dates only, so changing a rule does not rewrite history.
create or replace function public.snabil_default_score_policy()
returns jsonb language sql immutable set search_path='' as $$
 select '{
  "memorization":{"perfect_errors":0,"perfect_doubts":0,"very_good_errors":0,"very_good_doubts":0},
  "recentReview":{"perfect_errors":0,"perfect_doubts":0,"very_good_errors":0,"very_good_doubts":0},
  "major":{"error_weight":2,"perfect_max":1,"very_good_max":2,"good_max":5},
  "points":{
   "memorization":{"ممتاز":5,"جيد جدًا":3,"جيد":0,"لم يحفظ":0,"لم يسمع":0},
   "recentReview":{"ممتاز":5,"جيد جدًا":3,"جيد":0,"لم يحفظ":0,"لم يسمع":0},
   "major":{"ممتاز":10,"جيد جدًا":7,"جيد":4,"لم يحفظ":0,"لم يسمع":0}
  },
  "attendance":{"present":5,"late":3,"excused":3,"absent":0},
  "period":{"start":null,"end":null}
 }'::jsonb;
$$;
create table if not exists public.complex_score_policies (
 id bigint generated always as identity primary key,
 complex_id text not null references public.complexes(id) on delete cascade,
 org_id text not null references public.organizations(id),
 valid_from date not null,
 rules jsonb not null,
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 constraint complex_score_policy_unique unique(complex_id,valid_from),
 constraint complex_score_policy_object check(jsonb_typeof(rules)='object')
);
create index if not exists complex_score_policies_date_idx on public.complex_score_policies(complex_id,valid_from desc);
alter table public.complex_score_policies enable row level security;
drop policy if exists complex_score_policies_read on public.complex_score_policies;
create policy complex_score_policies_read on public.complex_score_policies for select to authenticated
using (private.can_access(org_id,complex_id,null,array['admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role,'teacher'::public.app_role]));
revoke all on public.complex_score_policies from anon,authenticated;
grant select on public.complex_score_policies to authenticated,service_role;

create or replace function public.snabil_score_policy_at(p_complex_id text,p_date date)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select rules from public.complex_score_policies
  where complex_id=p_complex_id and valid_from<=p_date order by valid_from desc limit 1),
  public.snabil_default_score_policy());
$$;
revoke all on function public.snabil_score_policy_at(text,date) from public,anon,authenticated;
grant execute on function public.snabil_score_policy_at(text,date) to service_role;

create or replace function public.snabil_score_grade_points(p_rules jsonb,p_track text,p_grade text)
returns integer language sql immutable set search_path='' as $$
 select greatest(0,least(100,coalesce((p_rules#>>array['points',p_track,coalesce(p_grade,'')])::integer,0)));
$$;
revoke all on function public.snabil_score_grade_points(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.snabil_score_grade_points(jsonb,text,text) to service_role;

create or replace function public.snabil_get_score_policy(p_complex_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org text;
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or not private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role,'teacher'::public.app_role])
 then raise exception 'ليس لديك صلاحية الاطلاع على لائحة المجمع.'; end if;
 return jsonb_build_object('complexId',p_complex_id,'rules',public.snabil_score_policy_at(p_complex_id,(now() at time zone 'Asia/Riyadh')::date),
  'nextEffective',((now() at time zone 'Asia/Riyadh')::date+1),
  'period',coalesce((select rules->'period' from public.complex_score_policies
    where complex_id=p_complex_id order by valid_from desc limit 1),public.snabil_default_score_policy()->'period'));
end $$;
revoke all on function public.snabil_get_score_policy(text) from public,anon;
grant execute on function public.snabil_get_score_policy(text) to authenticated,service_role;

create or replace function public.snabil_set_score_policy(p_complex_id text,p_rules jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org text; n text; x int; p jsonb; tomorrow date; start_d date; end_d date; names text[]:=array['memorization','recentReview'];
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or not private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role])
 then raise exception 'تعديل لائحة المجمع متاح لمشرف المجمع والإدارة فقط.'; end if;
 if jsonb_typeof(p_rules)<>'object' then raise exception 'لائحة غير صالحة.'; end if;
 -- Require a complete, bounded rubric, not arbitrary user supplied keys.
 if p_rules ?& array['memorization','recentReview','major','points','attendance','period'] is false
 then raise exception 'حقول اللائحة الأساسية ناقصة.'; end if;
 foreach n in array names loop
  if coalesce((p_rules#>>array[n,'perfect_errors'])::int,-1)<0
    or coalesce((p_rules#>>array[n,'perfect_doubts'])::int,-1)<0
    or coalesce((p_rules#>>array[n,'very_good_errors'])::int,-1)<0
    or coalesce((p_rules#>>array[n,'very_good_doubts'])::int,-1)<0
    or (p_rules#>>array[n,'perfect_errors'])::int>(p_rules#>>array[n,'very_good_errors'])::int
    or (p_rules#>>array[n,'perfect_doubts'])::int>(p_rules#>>array[n,'very_good_doubts'])::int
    or (p_rules#>>array[n,'very_good_errors'])::int>12
    or (p_rules#>>array[n,'very_good_doubts'])::int>20
  then raise exception 'حدود الحفظ وجنب الدرس غير صحيحة.'; end if;
 end loop;
 if coalesce((p_rules#>>'{major,error_weight}')::int,0)<1
  or (p_rules#>>'{major,error_weight}')::int>10
  or coalesce((p_rules#>>'{major,perfect_max}')::int,-1)<0
  or coalesce((p_rules#>>'{major,very_good_max}')::int,-1)<0
  or coalesce((p_rules#>>'{major,good_max}')::int,-1)<0
  or (p_rules#>>'{major,perfect_max}')::int>(p_rules#>>'{major,very_good_max}')::int
  or (p_rules#>>'{major,very_good_max}')::int>(p_rules#>>'{major,good_max}')::int
  or (p_rules#>>'{major,good_max}')::int>40
 then raise exception 'حدود المراجعة الكبرى غير صحيحة.'; end if;
 foreach n in array array['memorization','recentReview','major'] loop
  foreach p in array array['"ممتاز"'::jsonb,'"جيد جدًا"'::jsonb,'"جيد"'::jsonb,'"لم يحفظ"'::jsonb,'"لم يسمع"'::jsonb] loop
   x=(p_rules#>>array['points',n,p#>>'{}'])::integer;
   if x is null or x<0 or x>50 then raise exception 'نقاط التقديرات يجب أن تكون من 0 إلى 50.'; end if;
  end loop;
 end loop;
 foreach n in array array['present','late','excused','absent'] loop
  x=(p_rules#>>array['attendance',n])::int;
  if x is null or x<0 or x>25 then raise exception 'نقاط الحضور يجب أن تكون من 0 إلى 25.'; end if;
 end loop;
 if (p_rules#>>'{period,start}') is not null and (p_rules#>>'{period,end}') is not null then
  start_d=(p_rules#>>'{period,start}')::date;end_d=(p_rules#>>'{period,end}')::date;
  if end_d<start_d or end_d>start_d+366 then raise exception 'المدة لا تتجاوز سنة واحدة.'; end if;
 end if;
 tomorrow=(now() at time zone 'Asia/Riyadh')::date+1;
 insert into public.complex_score_policies(complex_id,org_id,valid_from,rules,created_by)
 values(p_complex_id,org,tomorrow,p_rules,auth.uid())
 on conflict(complex_id,valid_from) do update set rules=excluded.rules,created_at=now(),created_by=auth.uid();
 return jsonb_build_object('ok',true,'effectiveFrom',tomorrow,'rules',p_rules);
end $$;
revoke all on function public.snabil_set_score_policy(text,jsonb) from public,anon;
grant execute on function public.snabil_set_score_policy(text,jsonb) to authenticated,service_role;

create or replace function public.snabil_score_day_rows(p_complex text,p_start date,p_end date)
returns table(student_id text,circle_id text,date_key date,attendance_points integer,memorization_points integer,recent_review_points integer,major_review_points integer,total_points integer)
language sql stable security definer set search_path='' as $$
 with marks as (
 select student_id,date_key from public.student_attendance where complex_id=p_complex and date_key between p_start and p_end
 union select student_id,date_key from public.outcomes where complex_id=p_complex and date_key between p_start and p_end
 ), base as (
 select m.student_id,s.circle_id,m.date_key,sa.status, 
 o.memorization_rating,o.recent_review_rating,o.review_rating,
 public.snabil_score_policy_at(p_complex,m.date_key) rules
 from marks m join public.students s on s.id=m.student_id and s.complex_id=p_complex and s.active
 left join public.student_attendance sa on sa.student_id=m.student_id and sa.date_key=m.date_key
 left join public.outcomes o on o.student_id=m.student_id and o.date_key=m.date_key
 left join public.circle_day_types ct on ct.circle_id=s.circle_id and ct.date_key=m.date_key
 left join public.student_day_types sd on sd.student_id=m.student_id and sd.date_key=m.date_key
 where coalesce(sd.day_type,ct.day_type,'study') not in ('holiday','unaccounted')
 ), scored as(
 select b.student_id,b.circle_id,b.date_key,
 coalesce((b.rules#>>array['attendance',coalesce(b.status,'')])::int,0) attendance_points,
 case when b.status in ('present','late') then public.snabil_score_grade_points(b.rules,'memorization',b.memorization_rating) else 0 end memorization_points,
 case when b.status in ('present','late') then public.snabil_score_grade_points(b.rules,'recentReview',b.recent_review_rating) else 0 end recent_review_points,
 case when b.status in ('present','late') then coalesce(maj.score,public.snabil_score_grade_points(b.rules,'major',b.review_rating)) else 0 end major_review_points
 from base b
 left join lateral (
   select round(avg(public.snabil_score_grade_points(b.rules,'major',pd.rating)))::int score
   from public.plan_days pd join public.plans p on p.id=pd.plan_id and p.type='review'
   where pd.student_id=b.student_id and pd.date_key=b.date_key and pd.rating is not null
 ) maj on true
 )
 select z.student_id,z.circle_id,z.date_key,z.attendance_points,z.memorization_points,z.recent_review_points,z.major_review_points,
 (z.attendance_points+z.memorization_points+z.recent_review_points+z.major_review_points)::int
 from scored z;
$$;
revoke all on function public.snabil_score_day_rows(text,date,date) from public,anon,authenticated;
grant execute on function public.snabil_score_day_rows(text,date,date) to service_role;

create or replace function public.snabil_student_score_summary(p_student_id text,p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare st record; data jsonb; totals jsonb; c_rank int; cx_rank int; c_count int; cx_count int;
begin
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+366 then
  raise exception 'اختر فترة صحيحة لا تتجاوز سنة.'; end if;
 select s.id,s.complex_id,s.org_id,s.circle_id into st from public.students s
 where s.id=p_student_id and s.active;
 if not found then raise exception 'الطالب غير متاح.'; end if;
 if coalesce(auth.role(),'') <> 'service_role' and not private.can_access(st.org_id,st.complex_id,st.circle_id,
   array['admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role])
 then raise exception 'لا تسمح صلاحيتك بعرض النقاط.'; end if;
 with daily as (select * from public.snabil_score_day_rows(st.complex_id,p_start,p_end)),
 totals_by_student as (
 select s.id student_id,s.circle_id,coalesce(sum(d.total_points),0)::int total
 from public.students s left join daily d on d.student_id=s.id
 where s.complex_id=st.complex_id and s.active group by s.id,s.circle_id
 ),ranked as(
 select *,dense_rank() over(partition by circle_id order by total desc) r_circle,
  dense_rank() over(order by total desc) r_complex from totals_by_student
 )
 select jsonb_build_object(
  'total',r.total,'circleRank',r.r_circle,'complexRank',r.r_complex,
  'circleCount',(select count(*) from totals_by_student where circle_id=st.circle_id),
  'complexCount',(select count(*) from totals_by_student),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',d.date_key,'attendance',d.attendance_points,
    'memorization',d.memorization_points,'recentReview',d.recent_review_points,'majorReview',d.major_review_points,
    'total',d.total_points) order by d.date_key desc) from daily d where d.student_id=p_student_id),'[]'::jsonb),
  'from',p_start,'to',p_end,'rule','النقاط مشتقة من السجلات المؤكدة؛ لا تُحسب المسودات')
 into data from ranked r where r.student_id=p_student_id;
 return coalesce(data,jsonb_build_object('total',0,'daily','[]'::jsonb));
end $$;
revoke all on function public.snabil_student_score_summary(text,date,date) from public,anon;
grant execute on function public.snabil_student_score_summary(text,date,date) to service_role,authenticated;

create index if not exists snabil_score_attendance_lookup on public.student_attendance(complex_id,date_key,student_id);
create index if not exists snabil_score_outcome_lookup on public.outcomes(complex_id,date_key,student_id);
create index if not exists snabil_score_plan_lookup on public.plan_days(student_id,date_key) where rating is not null;
