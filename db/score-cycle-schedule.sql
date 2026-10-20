create or replace function public.snabil_set_score_cycle_schedule(p_complex_id text,p_reset date default null,p_duration integer default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cx record; last_end date; today date:=(now() at time zone 'Asia/Riyadh')::date;
begin
 select * into cx from public.complexes where id=p_complex_id and active;
 if not found or auth.uid() is null or not coalesce(private.can_access(cx.org_id,cx.id,null,array['admin','manager','supervisor']::public.app_role[]),false)
 then raise exception 'إعداد الدورات متاح لمشرف المجمع فقط.';end if;
 perform private.snabil_ensure_score_cycles(p_complex_id);
 select max(ends_on) into last_end from private.snabil_score_cycles where complex_id=p_complex_id;
 if last_end is null then raise exception 'احفظ دورة أولًا.';end if;
 if (p_reset is null)<>(p_duration is null) or (p_reset is not null and (p_reset<=last_end or p_reset<today or p_reset>today+3660 or p_duration not between 1 and 366))
 then raise exception 'اختر موعد تصفير بعد نهاية آخر دورة، ولا يسبق اليوم، ومدة من يوم إلى 366 يومًا.';end if;
 if p_reset is null then delete from private.snabil_score_cycle_schedule where complex_id=p_complex_id;
 else
 insert into private.snabil_score_cycle_schedule(complex_id,next_start,duration_days,created_by)
 values(p_complex_id,p_reset,p_duration,auth.uid()) on conflict(complex_id) do update
 set next_start=excluded.next_start,duration_days=excluded.duration_days,created_by=excluded.created_by,updated_at=now();
 end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.snabil_set_score_cycle_schedule(text,date,integer) from public,anon;
grant execute on function public.snabil_set_score_cycle_schedule(text,date,integer) to authenticated;
notify pgrst,'reload schema';
