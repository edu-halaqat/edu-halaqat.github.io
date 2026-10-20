-- Cycles retain their date windows. A new cycle never deletes attendance or outcomes.
create table if not exists private.snabil_score_cycles (
 id bigint generated always as identity primary key,
 complex_id text not null references public.complexes(id),
 name text not null check(length(name) between 1 and 100),
 starts_on date not null, ends_on date not null,
 created_by uuid, created_at timestamptz not null default now(),
 unique(complex_id,starts_on),
 check(ends_on>=starts_on and ends_on<starts_on+366)
);
create table if not exists private.snabil_score_cycle_schedule (
 complex_id text primary key references public.complexes(id),
 next_start date not null, duration_days integer not null check(duration_days between 1 and 366),
 created_by uuid, updated_at timestamptz not null default now()
);
alter table private.snabil_score_cycles enable row level security;
alter table private.snabil_score_cycle_schedule enable row level security;
revoke all on private.snabil_score_cycles,private.snabil_score_cycle_schedule from public,anon,authenticated;

-- Lazy rollover uses Riyadh dates and a per-complex lock; no cron or browser clock required.
create or replace function private.snabil_ensure_score_cycles(p_complex_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare cfg record; d date; today date:=(now() at time zone 'Asia/Riyadh')::date;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('score-cycles:'||p_complex_id,0));
 select * into cfg from private.snabil_score_cycle_schedule where complex_id=p_complex_id;
 if not found then return; end if;
 d:=cfg.next_start;
 while d<=today loop
  insert into private.snabil_score_cycles(complex_id,name,starts_on,ends_on,created_by)
  values(p_complex_id,'دورة '||d::text,d,d+cfg.duration_days-1,cfg.created_by);
  d:=d+cfg.duration_days;
 end loop;
 update private.snabil_score_cycle_schedule set next_start=d where complex_id=p_complex_id;
end $$;
revoke all on function private.snabil_ensure_score_cycles(text) from public,anon,authenticated;

create or replace function private.snabil_score_cycle_context(p_complex_id text,p_cycle_id bigint default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cy record; cycles jsonb; cfg jsonb; today date:=(now() at time zone 'Asia/Riyadh')::date; rules jsonb; a date; b date;
begin
 perform private.snabil_ensure_score_cycles(p_complex_id);
 select jsonb_agg(jsonb_build_object('id',id,'name',name,'from',starts_on,'end',ends_on,'duration',ends_on-starts_on+1,
 'status',case when starts_on>today then 'scheduled' when ends_on<today then 'closed' else 'active' end) order by starts_on desc)
 into cycles from private.snabil_score_cycles where complex_id=p_complex_id;
 select jsonb_build_object('nextStart',next_start,'duration',duration_days) into cfg from private.snabil_score_cycle_schedule where complex_id=p_complex_id;
 if p_cycle_id is not null then
  select * into cy from private.snabil_score_cycles where complex_id=p_complex_id and id=p_cycle_id;
  if not found then raise exception 'الدورة غير موجودة في هذا المجمع.'; end if;
 else
  select * into cy from private.snabil_score_cycles where complex_id=p_complex_id
  order by (starts_on<=today) desc,case when starts_on<=today then starts_on end desc,starts_on asc limit 1;
 end if;
 if cy.id is not null then
  return jsonb_build_object('id',cy.id,'name',cy.name,'from',cy.starts_on,'end',cy.ends_on,
  'to',case when cy.starts_on<=today then least(cy.ends_on,today) end,
  'status',case when cy.starts_on>today then 'scheduled' when cy.ends_on<today then 'closed' else 'active' end,
  'duration',cy.ends_on-cy.starts_on+1,'cycles',cycles,'schedule',cfg,'today',today);
 end if;
 -- Preserve the existing configured window until a supervisor creates the first cycle.
 select p.rules into rules from public.complex_score_policies p where p.complex_id=p_complex_id order by valid_from desc limit 1;
 a:=coalesce(nullif(rules#>>'{period,start}','')::date,date_trunc('month',today)::date);
 b:=coalesce(nullif(rules#>>'{period,end}','')::date,(date_trunc('month',today)+interval '1 month - 1 day')::date);
 if b<a or b>=a+366 then a:=date_trunc('month',today)::date;b:=(date_trunc('month',today)+interval '1 month - 1 day')::date;end if;
 return jsonb_build_object('id',null,'name','الفترة الحالية','from',a,'end',b,'to',case when a<=today then least(b,today) end,
 'duration',b-a+1,'status',case when a>today then 'scheduled' when b<today then 'closed' else 'active' end,'cycles','[]'::jsonb,'schedule',null,'today',today);
end $$;
revoke all on function private.snabil_score_cycle_context(text,bigint) from public,anon,authenticated;

create or replace function public.snabil_create_score_cycle(p_complex_id text,p_name text,p_start date,p_end date,p_reset date default null,p_duration integer default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cx record; new_id bigint;
begin
 select * into cx from public.complexes where id=p_complex_id and active;
 if not found or auth.uid() is null or not coalesce(private.can_access(cx.org_id,cx.id,null,array['admin','manager','supervisor']::public.app_role[]),false)
 then raise exception 'إعداد الدورات متاح لمشرف المجمع فقط.';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 or p_start is null or p_end is null or p_start<(now() at time zone 'Asia/Riyadh')::date-3660 or p_end>(now() at time zone 'Asia/Riyadh')::date+3660 or p_end<p_start or p_end>=p_start+366
 then raise exception 'حدد اسم الدورة وبدايتها ونهايتها؛ المدة من يوم إلى 366 يومًا.';end if;
 if (p_reset is null)<>(p_duration is null) or (p_reset is not null and (p_reset<=p_end or p_reset>(now() at time zone 'Asia/Riyadh')::date+3660 or p_duration not between 1 and 366))
 then raise exception 'موعد التصفير بعد نهاية الدورة، ومدة الدورات التالية من يوم إلى 366 يومًا.';end if;
 perform private.snabil_ensure_score_cycles(p_complex_id);
 if exists(select 1 from private.snabil_score_cycles where complex_id=p_complex_id and starts_on<=p_end and ends_on>=p_start)
 then raise exception 'الفترة تتداخل مع دورة محفوظة. اختر بداية بعد نهايتها.';end if;
 if exists(select 1 from private.snabil_score_cycles where complex_id=p_complex_id and ends_on>=p_start)
 then raise exception 'أضف الدورة الجديدة بعد آخر دورة محفوظة للحفاظ على الأرشيف.';end if;
 insert into private.snabil_score_cycles(complex_id,name,starts_on,ends_on,created_by)
 values(p_complex_id,trim(p_name),p_start,p_end,auth.uid()) returning id into new_id;
 if p_reset is null then
  delete from private.snabil_score_cycle_schedule where complex_id=p_complex_id;
 else
  insert into private.snabil_score_cycle_schedule(complex_id,next_start,duration_days,created_by)
  values(p_complex_id,p_reset,p_duration,auth.uid()) on conflict(complex_id) do update
  set next_start=excluded.next_start,duration_days=excluded.duration_days,created_by=excluded.created_by,updated_at=now();
 end if;
 return jsonb_build_object('id',new_id);
end $$;
revoke all on function public.snabil_create_score_cycle(text,text,date,date,date,integer) from public,anon;
grant execute on function public.snabil_create_score_cycle(text,text,date,date,date,integer) to authenticated;
-- Aggregation is private because ranking must include peers beyond teacher row scope.
-- Public RPC is invoker-only; the private implementation authorizes every complex.
create or replace function private.snabil_honor_roll_cycle(p_complex_id text default null,p_cycle_id bigint default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare cx record; choices jsonb; rules jsonb; start_on date; end_on date; today date:=(now() at time zone 'Asia/Riyadh')::date; payload jsonb; teacher_only boolean; cycle jsonb;
begin
 if auth.uid() is null then raise exception 'سجّل الدخول لعرض لوحة الشرف.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name),'[]'::jsonb)
 into choices from public.complexes c where c.active and coalesce(private.can_access(c.org_id,c.id,null,array['admin','manager','supervisor','teacher']::public.app_role[]),false);
 if jsonb_array_length(choices)=0 then raise exception 'لا يوجد مجمع ضمن صلاحية حسابك.'; end if;
 select c.* into cx from public.complexes c where c.id=coalesce(p_complex_id,choices->0->>'id') and c.active;
 if not found or not coalesce(private.can_access(cx.org_id,cx.id,null,array['admin','manager','supervisor','teacher']::public.app_role[]),false)
 then raise exception 'غير مصرح بعرض لوحة هذا المجمع.'; end if;
 teacher_only:=not coalesce(private.can_access(cx.org_id,cx.id,null,array['admin','manager','supervisor']::public.app_role[]),false);
 cycle:=private.snabil_score_cycle_context(cx.id,p_cycle_id);
 start_on:=(cycle->>'from')::date;end_on:=(cycle->>'to')::date;
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
 'cycle',cycle,'from',start_on,'to',end_on,'teacherOnly',teacher_only,'generatedAt',now(),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'circleId',circle_id,'circleName',circle_name,
 'points',total,'days',days,'mine',mine,'complexRank',complex_rank,'circleRank',circle_rank) order by total desc,full_name,id),'[]'::jsonb))
 into payload from ranked;
 return payload;
end $$;

revoke all on function private.snabil_honor_roll_cycle(text,bigint) from public,anon;
grant execute on function private.snabil_honor_roll_cycle(text,bigint) to authenticated;
create or replace function public.snabil_honor_roll_cycle(p_complex_id text default null,p_cycle_id bigint default null)
returns jsonb language sql volatile security invoker set search_path='' as $$select private.snabil_honor_roll_cycle(p_complex_id,p_cycle_id);$$;
revoke all on function public.snabil_honor_roll_cycle(text,bigint) from public,anon;
grant execute on function public.snabil_honor_roll_cycle(text,bigint) to authenticated;
-- Existing clients also get the clipped counting period immediately.
create or replace function private.snabil_honor_roll(p_complex_id text default null)
returns jsonb language sql volatile security definer set search_path='' as $$select private.snabil_honor_roll_cycle(p_complex_id,null);$$;
create or replace function public.snabil_honor_roll(p_complex_id text default null)
returns jsonb language sql volatile security invoker set search_path='' as $$select private.snabil_honor_roll_cycle(p_complex_id,null);$$;

-- Called only after the guardian Edge Function has authenticated the parent/student link.
create or replace function public.snabil_guardian_score_cycle(p_student_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cx text; cycle jsonb; score jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'غير مصرح.';end if;
 select complex_id into cx from public.students where id=p_student_id and active;
 if not found then raise exception 'الطالب غير موجود.';end if;
 cycle:=private.snabil_score_cycle_context(cx,null);
 if cycle->>'to' is null then score:=jsonb_build_object('total',0,'circleRank',null,'complexRank',null,'daily','[]'::jsonb,'from',cycle->>'from','to',null);
 else score:=public.snabil_student_score_summary(p_student_id,(cycle->>'from')::date,(cycle->>'to')::date);end if;
 return jsonb_build_object('period',score,'cycle',cycle);
end $$;
revoke all on function public.snabil_guardian_score_cycle(text) from public,anon,authenticated;
grant execute on function public.snabil_guardian_score_cycle(text) to service_role;
notify pgrst,'reload schema';
