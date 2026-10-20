-- Aggregation is private because ranking must include peers beyond teacher row scope.
-- Public RPC is invoker-only; the private implementation authorizes every complex.
create or replace function private.snabil_honor_roll(p_complex_id text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare cx record; choices jsonb; rules jsonb; start_on date; end_on date; today date:=(now() at time zone 'Asia/Riyadh')::date; payload jsonb; teacher_only boolean;
begin
 if auth.uid() is null then raise exception 'سجّل الدخول لعرض لوحة الشرف.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name),'[]'::jsonb)
 into choices from public.complexes c where c.active and coalesce(private.can_access(c.org_id,c.id,null,array['admin','manager','supervisor','teacher']::public.app_role[]),false);
 if jsonb_array_length(choices)=0 then raise exception 'لا يوجد مجمع ضمن صلاحية حسابك.'; end if;
 select c.* into cx from public.complexes c where c.id=coalesce(p_complex_id,choices->0->>'id') and c.active;
 if not found or not coalesce(private.can_access(cx.org_id,cx.id,null,array['admin','manager','supervisor','teacher']::public.app_role[]),false)
 then raise exception 'غير مصرح بعرض لوحة هذا المجمع.'; end if;
 teacher_only:=not coalesce(private.can_access(cx.org_id,cx.id,null,array['admin','manager','supervisor']::public.app_role[]),false);
 select p.rules into rules from public.complex_score_policies p where p.complex_id=cx.id order by p.valid_from desc limit 1;
 start_on:=coalesce(nullif(rules#>>'{period,start}','')::date,date_trunc('month',today)::date);
 end_on:=coalesce(nullif(rules#>>'{period,end}','')::date,today);
 if end_on<start_on or end_on>start_on+366 then start_on:=date_trunc('month',today)::date;end_on:=today;end if;
 with daily as materialized (select * from public.snabil_score_day_rows(cx.id,start_on,end_on)),
 totals as (
 select s.id,s.full_name,s.circle_id,coalesce(c.name,'غير مسند إلى حلقة') circle_name,
 coalesce(sum(d.total_points),0)::int total,count(d.date_key)::int days,
 coalesce(private.can_access(s.org_id,s.complex_id,s.circle_id,array['teacher']::public.app_role[]),false) mine
 from public.students s left join public.circles c on c.id=s.circle_id
 left join daily d on d.student_id=s.id
 where s.active and s.complex_id=cx.id group by s.id,s.full_name,s.circle_id,c.name,s.org_id,s.complex_id
 ), ranked as (
 select *,dense_rank() over(order by total desc) complex_rank,
 dense_rank() over(partition by circle_id order by total desc) circle_rank from totals
 ) select jsonb_build_object('complexId',cx.id,'complexName',cx.name,'complexes',choices,
 'from',start_on,'to',end_on,'teacherOnly',teacher_only,'generatedAt',now(),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'circleId',circle_id,'circleName',circle_name,
 'points',total,'days',days,'mine',mine,'complexRank',complex_rank,'circleRank',circle_rank) order by total desc,full_name,id),'[]'::jsonb))
 into payload from ranked;
 return payload;
end $$;
revoke all on function private.snabil_honor_roll(text) from public,anon;
grant execute on function private.snabil_honor_roll(text) to authenticated;
create or replace function public.snabil_honor_roll(p_complex_id text default null)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.snabil_honor_roll(p_complex_id);$$;
revoke all on function public.snabil_honor_roll(text) from public,anon;
grant execute on function public.snabil_honor_roll(text) to authenticated;
