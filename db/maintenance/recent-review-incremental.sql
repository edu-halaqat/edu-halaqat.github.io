CREATE OR REPLACE FUNCTION private.rebuild_recent_review_plan(p_plan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=(select auth.uid());
 v_plan public.plans%rowtype;
 v_mem public.plans%rowtype;
 v_md public.plan_days%rowtype;
 v_win record;
 v_from jsonb;
 v_to jsonb;
 v_segments jsonb;
 v_preserve_until date;
 v_generated integer:=0;
 v_generated_dates date[]:='{}'::date[];
 v_first_ref jsonb;
begin
 select * into v_plan from public.plans where id=p_plan_id for update;
 if not found or v_plan.type<>'recent_review' then raise exception 'خطة المراجعة الصغرى غير موجودة.'; end if;
 if v_plan.unit::text not in('pages','ayahs','surahs') then raise exception 'وحدة المراجعة الصغرى غير صالحة.'; end if;

 if v_plan.linked_plan_id is not null then
   select * into v_mem from public.plans
   where id=v_plan.linked_plan_id and student_id=v_plan.student_id and type='memorization';
 end if;
 if v_mem.id is null then
   select * into v_mem from public.plans
   where student_id=v_plan.student_id and type='memorization' and status='active'
     and start_date<=v_plan.end_date and end_date>=v_plan.start_date
   order by updated_at desc limit 1;
 end if;
 if v_mem.id is null then raise exception 'أنشئ خطة الحفظ الجديد أولًا؛ فالمراجعة الصغرى تتبع درس الطالب ولا تملك بداية مستقلة.'; end if;

 update public.plans set linked_plan_id=v_mem.id,direction='toward_nas'::public.plan_direction,
   cycle_enabled=false,name=coalesce(nullif(name,''),'المراجعة الصغرى'),updated_at=now(),updated_by=v_actor
 where id=v_plan.id
   and (linked_plan_id,direction,cycle_enabled,name) is distinct from
       (v_mem.id,'toward_nas'::public.plan_direction,false,coalesce(nullif(v_plan.name,''),'المراجعة الصغرى'));

 select max(pd.date_key) into v_preserve_until
 from public.plan_days pd
 where pd.plan_id=v_plan.id
   and (pd.rating is not null or coalesce(pd.completed_amount,0)>0 or pd.status<>'planned');

 -- Retain matching rows; remove obsolete dates after generating the desired set.

 for v_md in
   select pd.*
   from public.plan_days pd
   where pd.plan_id=v_mem.id
     and pd.date_key between v_plan.start_date and v_plan.end_date
     and (v_preserve_until is null or pd.date_key>v_preserve_until)
     and pd.target_to is not null
   order by pd.date_key
 loop
   select * into v_win
   from private.recent_review_window((v_md.target_to->>'ayahIndex')::integer,v_plan.unit,v_plan.daily_amount);
   if v_win.start_index is null then continue; end if;

   v_from:=private.quran_target_ref(
     v_win.start_index,
     (select q.page_no::integer from public.quran_ayahs q where q.ayah_index=v_win.start_index limit 1),
     null
   );
   v_to:=private.quran_target_ref(
     v_win.end_index,
     (select q.page_no::integer from public.quran_ayahs q where q.ayah_index=v_win.end_index limit 1),
     null
   );
   v_segments:=private.quran_range_segments(v_win.start_index,v_win.end_index);
   if v_first_ref is null then v_first_ref:=v_from; end if;

   insert into public.plan_days(
     plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
     target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
   ) values(
     v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,v_md.date_key,
     v_from,v_to,v_win.actual_amount,'planned',v_actor,v_actor,1,v_segments
   )
   on conflict(plan_id,date_key) do update set
     org_id=excluded.org_id,complex_id=excluded.complex_id,circle_id=excluded.circle_id,
     student_id=excluded.student_id,teacher_id=excluded.teacher_id,
     target_from=excluded.target_from,target_to=excluded.target_to,target_amount=excluded.target_amount,
     segments=excluded.segments,updated_at=now(),updated_by=v_actor
   where (plan_days.org_id,plan_days.complex_id,plan_days.circle_id,plan_days.student_id,plan_days.teacher_id,
          plan_days.target_from,plan_days.target_to,plan_days.target_amount,plan_days.segments)
     is distinct from (excluded.org_id,excluded.complex_id,excluded.circle_id,excluded.student_id,excluded.teacher_id,
          excluded.target_from,excluded.target_to,excluded.target_amount,excluded.segments);
   v_generated_dates:=array_append(v_generated_dates,v_md.date_key);
   v_generated:=v_generated+1;
 end loop;

 delete from public.plan_days pd
 where pd.plan_id=v_plan.id
   and (v_preserve_until is null or pd.date_key>v_preserve_until)
   and not (pd.date_key=any(v_generated_dates));

 if v_first_ref is not null then
   update public.plans set start_ref=v_first_ref,linked_plan_id=v_mem.id,updated_at=now(),updated_by=v_actor
   where id=v_plan.id
     and (start_ref,linked_plan_id) is distinct from (v_first_ref,v_mem.id);
 end if;

 return jsonb_build_object('ok',true,'planId',v_plan.id,'linkedMemorizationPlanId',v_mem.id,
   'generatedDays',v_generated,'preservedThrough',v_preserve_until,'rolling',true);
end;
$function$;

