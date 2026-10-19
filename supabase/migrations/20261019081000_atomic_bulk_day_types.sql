-- Atomic, scoped subset of the existing day-classification operation.
-- Reuses set_day_type_guarded for each student inside one transaction;
-- failure rolls back all changes, including any plan roll-forward.
create or replace function public.set_day_types_bulk_guarded(
  p_circle_id text, p_date date,p_day_type text,p_student_ids text[]
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_id text; v_count integer;v_updated integer:=0;v_plans integer:=0;v_result jsonb;
begin
 if p_date is null or p_circle_id is null or p_day_type not in ('study','test','holiday','unaccounted','inherit')
 then raise exception 'بيانات تصنيف اليوم غير مكتملة';end if;
 v_count:=cardinality(p_student_ids);
 if v_count is null or v_count<1 or v_count>100 or
    (select count(distinct x) from unnest(p_student_ids) x where x is not null)<>v_count
 then raise exception 'حدد من 1 إلى 100 طالب دون تكرار';end if;
 if exists(
   select 1 from unnest(p_student_ids) x
   left join public.students s on s.id=x and s.circle_id=p_circle_id and s.active
   where s.id is null
 ) then raise exception 'تحتوي المجموعة على طالب غير نشط أو خارج الحلقة';end if;
 for v_id in select unnest(p_student_ids) order by 1 loop
   v_result:=public.set_day_type_guarded(p_circle_id,p_date,p_day_type,v_id);
   v_updated:=v_updated+coalesce((v_result->>'students')::int,0);
   v_plans:=v_plans+coalesce((v_result->>'affectedPlans')::int,0);
 end loop;
 return jsonb_build_object('ok',true,'selected',v_count,'updated',v_updated,'affectedPlans',v_plans);
end $$;
revoke all on function public.set_day_types_bulk_guarded(text,date,text,text[]) from public,anon;
grant execute on function public.set_day_types_bulk_guarded(text,date,text,text[]) to authenticated;
