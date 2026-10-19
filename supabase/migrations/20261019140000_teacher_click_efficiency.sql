-- Privacy-preserving click-efficiency sessions for each teacher and circle.
-- No student names, identifiers, voice transcripts, grades or question content.
create table if not exists public.circle_efficiency_sessions (
 actor_id uuid not null,
 org_id text not null,
 complex_id text not null,
 circle_id text not null,
 date_key date not null,
 client_session uuid not null,
 clicks integer not null default 0 check(clicks between 0 and 100000),
 active_seconds integer not null default 0 check(active_seconds between 0 and 86400),
 categories jsonb not null default '{}'::jsonb check(jsonb_typeof(categories)='object'),
 updated_at timestamptz not null default now(),
 primary key(actor_id,circle_id,date_key,client_session)
);
create index if not exists circle_efficiency_scope_date
 on public.circle_efficiency_sessions(complex_id,date_key,circle_id);
alter table public.circle_efficiency_sessions enable row level security;
revoke all on public.circle_efficiency_sessions from public,anon,authenticated;
grant select on public.circle_efficiency_sessions to authenticated;
drop policy if exists circle_efficiency_allowed_read on public.circle_efficiency_sessions;
create policy circle_efficiency_allowed_read on public.circle_efficiency_sessions
 for select to authenticated
 using (actor_id=auth.uid() or
  private.can_access(org_id,complex_id,circle_id,
    array['admin','manager','supervisor']::public.app_role[]));

create or replace function public.record_circle_efficiency_guarded(
 p_circle_id text,p_date date,p_client_session uuid,
 p_clicks integer,p_active_seconds integer,p_categories jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org text; v_complex text; v_total integer; v_field record; v_updated integer;
begin
 if auth.uid() is null or not private.active_user() then
  raise exception 'يلزم حساب معلم أو مشرف نشط' using errcode='42501';end if;
 select org_id,complex_id into v_org,v_complex
 from public.circles where id=p_circle_id and active;
 if v_org is null or not private.can_access(v_org,v_complex,p_circle_id,
  array['admin','manager','supervisor','teacher']::public.app_role[])
 then raise exception 'ليس لديك إذن قياس الحلقة' using errcode='42501';end if;
 if p_client_session is null or p_date not between current_date-2 and current_date+1
   or p_clicks not between 0 and 100000 or p_active_seconds not between 0 and 86400
   or jsonb_typeof(p_categories)<>'object'
 then raise exception 'القياسات غير صالحة';end if;
 if exists(
  select 1 from jsonb_each(p_categories) item
  where item.key not in ('attendance','grade','details','bulk','navigation','other')
    or jsonb_typeof(item.value)<>'number'
    or item.value::text !~ '^[0-9]{1,6}$'
    or (item.value::text)::integer>p_clicks
 ) then raise exception 'تصنيفات النقرات غير صالحة';end if;
 select coalesce(sum((item.value::text)::integer),0)::integer into v_total
 from jsonb_each(p_categories) item;
 if v_total>p_clicks then raise exception 'عدد النقرات لا يتوافق مع التصنيفات';end if;
 insert into public.circle_efficiency_sessions
  (actor_id,org_id,complex_id,circle_id,date_key,client_session,clicks,active_seconds,categories)
 values(auth.uid(),v_org,v_complex,p_circle_id,p_date,p_client_session,
  p_clicks,p_active_seconds,p_categories)
 on conflict(actor_id,circle_id,date_key,client_session) do update set
  clicks=greatest(public.circle_efficiency_sessions.clicks,excluded.clicks),
  active_seconds=greatest(public.circle_efficiency_sessions.active_seconds,excluded.active_seconds),
  categories=case when excluded.clicks>=public.circle_efficiency_sessions.clicks
   then excluded.categories else public.circle_efficiency_sessions.categories end,
  updated_at=now();
 get diagnostics v_updated=row_count;
 return jsonb_build_object('ok',v_updated=1);
end $$;
revoke all on function public.record_circle_efficiency_guarded(text,date,uuid,integer,integer,jsonb)
 from public,anon;
grant execute on function public.record_circle_efficiency_guarded(text,date,uuid,integer,integer,jsonb)
 to authenticated;
