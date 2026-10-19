-- Aggregated non-identifying teacher timing samples for live supervisor dashboards.
-- Does not store student names, identities, grades, content or device identifiers.
create table if not exists public.circle_operation_samples (
  id bigint generated always as identity primary key,
  org_id text not null,
  complex_id text not null,
  circle_id text not null,
  operation text not null check(operation in ('outcome_save','session_open','attendance_save')),
  duration_ms integer not null check(duration_ms between 0 and 120000),
  succeeded boolean not null,
  observed_at timestamptz not null default now()
);
create index if not exists circle_operation_samples_recent on public.circle_operation_samples
  (complex_id,observed_at desc,circle_id);
alter table public.circle_operation_samples enable row level security;
revoke all on public.circle_operation_samples from anon,authenticated;
grant select on public.circle_operation_samples to authenticated;
drop policy if exists circle_operation_supervisor_read on public.circle_operation_samples;
create policy circle_operation_supervisor_read on public.circle_operation_samples
 for select to authenticated using(
 private.can_access(org_id,complex_id,circle_id,
 array['admin','manager','supervisor']::public.app_role[])
 );
create or replace function public.record_circle_operation_sample(
 p_circle_id text,p_operation text,p_duration_ms integer,p_succeeded boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org text;v_complex text;
begin
 if auth.uid() is null or not private.active_user() then
  raise exception 'يجب تسجيل الدخول' using errcode='42501';end if;
 if p_operation not in ('outcome_save','session_open','attendance_save') or
    p_duration_ms is null or p_duration_ms<0 or p_duration_ms>120000 or p_succeeded is null
 then raise exception 'قيمة قياس غير صالحة';end if;
 select org_id,complex_id into v_org,v_complex from public.circles where id=p_circle_id and active;
 if v_org is null or not private.can_access(v_org,v_complex,p_circle_id,
   array['admin','manager','supervisor','teacher']::public.app_role[])
 then raise exception 'لا تسمح صلاحيتك بتسجيل هذا القياس' using errcode='42501';end if;
 insert into public.circle_operation_samples(org_id,complex_id,circle_id,operation,duration_ms,succeeded)
 values(v_org,v_complex,p_circle_id,p_operation,p_duration_ms,p_succeeded);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.record_circle_operation_sample(text,text,integer,boolean) from public,anon;
grant execute on function public.record_circle_operation_sample(text,text,integer,boolean) to authenticated;
