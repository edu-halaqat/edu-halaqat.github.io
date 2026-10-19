-- Serve the correct rubric for the day being assessed without leaking other complexes.
create or replace function public.snabil_get_score_policy_for_date(p_complex_id text,p_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org text;
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or not private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role,'teacher'::public.app_role])
 then raise exception 'غير مصرح بعرض لائحة هذا المجمع.'; end if;
 if p_date is null then raise exception 'حدد التاريخ.'; end if;
 return public.snabil_score_policy_at(p_complex_id,p_date);
end $$;
revoke all on function public.snabil_get_score_policy_for_date(text,date) from public,anon;
grant execute on function public.snabil_get_score_policy_for_date(text,date) to authenticated,service_role;

create or replace function public.snabil_get_score_policy(p_complex_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org text; p jsonb;
begin
 select org_id into org from public.complexes where id=p_complex_id;
 if org is null or not private.can_access(org,p_complex_id,null,array[
  'admin'::public.app_role,'manager'::public.app_role,'supervisor'::public.app_role,'teacher'::public.app_role])
 then raise exception 'غير مصرح بعرض لائحة هذا المجمع.'; end if;
 select rules into p from public.complex_score_policies
 where complex_id=p_complex_id order by valid_from desc limit 1;
 return jsonb_build_object('complexId',p_complex_id,'rules',coalesce(p,public.snabil_default_score_policy()),
 'effectiveFrom',(select valid_from from public.complex_score_policies where complex_id=p_complex_id order by valid_from desc limit 1),
 'nextEffective',((now() at time zone 'Asia/Riyadh')::date+1));
end $$;
revoke all on function public.snabil_get_score_policy(text) from public,anon;
grant execute on function public.snabil_get_score_policy(text) to authenticated,service_role;
