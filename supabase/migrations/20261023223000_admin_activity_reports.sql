-- Admin-only operational insight from the existing central, multi-device activity events.
-- Read-only aggregates. No student content, typed values, or credentials.
create or replace function public.get_platform_activity_report(p_period text default 'today')
returns jsonb language plpgsql stable security definer
set search_path to '' set statement_timeout to '10s'
as $function$
declare
 v_from timestamptz;
 v_to timestamptz := now();
 v_report jsonb;
begin
 if (select auth.uid()) is null or not private.active_user()
    or not private.has_role('admin'::public.app_role) then
  raise exception 'هذه التقارير مخصصة لمدير النظام.' using errcode='42501';
 end if;
 if p_period = 'live' then
  v_from := v_to - interval '15 minutes';
 elsif p_period = 'today' then
  v_from := date_trunc('day', v_to at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
 elsif p_period = 'week' then
  v_from := (date_trunc('day',v_to at time zone 'Asia/Riyadh') - interval '6 days') at time zone 'Asia/Riyadh';
 else
  raise exception 'نطاق التقرير غير صالح.' using errcode='22023';
 end if;
 with scoped as materialized (
  select e.actor_uid,e.session_id,e.kind,e.view_key,e.action_key,
         e.duration_ms,e.succeeded,e.device_kind,e.created_at
  from public.platform_activity_events e
  where e.created_at >= v_from and e.created_at <= v_to
 )
 select jsonb_build_object(
  'period',p_period,'from',v_from,'to',v_to,
  'summary',jsonb_build_object(
    'events',(select count(*) from scoped),
    'users',(select count(distinct actor_uid) from scoped),
    'sessions',(select count(distinct session_id) from scoped),
    'failures',(select count(*) from scoped where succeeded=false),
    'observed',(select count(*) from scoped where succeeded is not null),
    'slow',(select count(*) from scoped where duration_ms>2000),
    'first',(select min(created_at) from scoped),
    'last',(select max(created_at) from scoped),
    'failureRate',(select round(100.0*count(*) filter(where succeeded=false)
                     /nullif(count(*) filter(where succeeded is not null),0),1) from scoped),
    'p95Ms',(select percentile_disc(0.95) within group(order by duration_ms) from scoped where duration_ms is not null)
  ),
  'byActor',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.events desc)
    from (
      select agg.actor_uid::text actor_id,
       coalesce(nullif(p.display_name,''),nullif(p.full_name,''),nullif(t.full_name,''),'مستخدم '||left(agg.actor_uid::text,8)) actor_name,
       agg.events,agg.failures,agg.sessions,agg.p95_ms,agg.slow
      from (
       select actor_uid,count(*) events,count(*) filter(where succeeded=false) failures,
        count(distinct session_id) sessions,
        percentile_disc(0.95) within group(order by duration_ms) p95_ms,
        count(*) filter(where duration_ms>2000) slow
       from scoped group by actor_uid
      ) agg
      left join public.profiles p on p.id=agg.actor_uid
      left join lateral (
       select full_name from public.teachers where user_id=agg.actor_uid and active
       order by updated_at desc limit 1
      ) t on true
      order by agg.events desc limit 100
    ) x
  ),'[]'::jsonb),
  'byView',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.failures desc,x.events desc)
    from (
      select view_key,count(*) events,count(*) filter(where succeeded=false) failures,
       count(*) filter(where duration_ms>2000) slow,
       percentile_disc(0.95) within group(order by duration_ms) p95_ms
      from scoped group by view_key order by failures desc,events desc limit 80
    ) x
  ),'[]'::jsonb),
  'byAction',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.failures desc,x.p95_ms desc nulls last)
    from (
      select kind,view_key,action_key,count(*) events,
       count(*) filter(where succeeded=false) failures,
       count(*) filter(where duration_ms>2000) slow,
       round(avg(duration_ms),0) mean_ms,
       percentile_disc(0.95) within group(order by duration_ms) p95_ms
      from scoped
      group by kind,view_key,action_key
      order by failures desc,p95_ms desc nulls last limit 100
    ) x
  ),'[]'::jsonb),
  'byDevice',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.events desc) from (
      select device_kind,count(*) events,count(distinct actor_uid) users,
       count(*) filter(where succeeded=false) failures,
       percentile_disc(0.95) within group(order by duration_ms) p95_ms
      from scoped group by device_kind
    ) x
  ),'[]'::jsonb),
  'trend',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.bucket) from (
      select
       case when p_period='live' then date_trunc('minute',created_at at time zone 'Asia/Riyadh')
            when p_period='today' then date_trunc('hour',created_at at time zone 'Asia/Riyadh')
            else date_trunc('day',created_at at time zone 'Asia/Riyadh') end as bucket,
       count(*) events,count(*) filter(where succeeded=false) failures,
       count(distinct actor_uid) users
      from scoped group by 1 order by 1
    ) x
  ),'[]'::jsonb),
  'recentFailures',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.created_at,e.view_key,e.action_key,e.kind,e.device_kind,e.duration_ms,
       coalesce(nullif(p.display_name,''),nullif(p.full_name,''),nullif(t.full_name,''),'مستخدم '||left(e.actor_uid::text,8)) actor_name
      from scoped e
      left join public.profiles p on p.id=e.actor_uid
      left join lateral (
       select full_name from public.teachers where user_id=e.actor_uid and active
       order by updated_at desc limit 1
      ) t on true
      where e.succeeded=false or e.kind='error'
      order by e.created_at desc limit 80
    ) x
  ),'[]'::jsonb)
 ) into v_report;
 return v_report;
end;
$function$;
revoke all on function public.get_platform_activity_report(text) from public,anon;
grant execute on function public.get_platform_activity_report(text) to authenticated;
