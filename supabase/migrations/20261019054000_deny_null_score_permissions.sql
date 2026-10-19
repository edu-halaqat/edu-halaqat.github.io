-- Treat NULL permission results as DENIED in security-definer score RPCs.
create or replace function public.snabil_set_score_policy(p_complex_id text,p_rules jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org text; n text; x int; p jsonb; tomorrow date; start_d date; end_d date; names text[]:=array['memorization','recentReview'];
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or coalesce(private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role]),false) = false
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

create or replace function public.snabil_student_score_summary(p_student_id text,p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare st record; data jsonb; totals jsonb; c_rank int; cx_rank int; c_count int; cx_count int;
begin
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+366 then
  raise exception 'اختر فترة صحيحة لا تتجاوز سنة.'; end if;
 select s.id,s.complex_id,s.org_id,s.circle_id into st from public.students s
 where s.id=p_student_id and s.active;
 if not found then raise exception 'الطالب غير متاح.'; end if;
 if coalesce(auth.role(),'') <> 'service_role' and coalesce(private.can_access(st.org_id,st.complex_id,st.circle_id,
   array['admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role]),false) = false
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

create or replace function public.snabil_get_score_policy_for_date(p_complex_id text,p_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org text;
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or coalesce(private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role,'teacher'::public.app_role]),false) = false
 then raise exception 'غير مصرح بعرض لائحة هذا المجمع.'; end if;
 if p_date is null then raise exception 'حدد التاريخ.'; end if;
 return public.snabil_score_policy_at(p_complex_id,p_date);
end $$;

create or replace function public.snabil_get_score_policy(p_complex_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org text; p jsonb;
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or coalesce(private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role,'teacher'::public.app_role]),false) = false
 then raise exception 'غير مصرح بعرض لائحة هذا المجمع.'; end if;
 select rules into p from public.complex_score_policies
 where complex_id=p_complex_id order by valid_from desc limit 1;
 return jsonb_build_object('complexId',p_complex_id,'rules',coalesce(p,public.snabil_default_score_policy()),
 'effectiveFrom',(select valid_from from public.complex_score_policies where complex_id=p_complex_id order by valid_from desc limit 1),
 'nextEffective',((now() at time zone 'Asia/Riyadh')::date+1));
end $$;

