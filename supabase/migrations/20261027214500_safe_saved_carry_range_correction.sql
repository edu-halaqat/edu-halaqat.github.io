-- Preserve completed and carried memorization assessments during legitimate
-- day-range corrections. Explicitly reject already assessed later dates.
-- No history deletion: all uncommitted operations roll back on any error.
DO $repair$
DECLARE
 f text;
 old_check text := $old$
    if v_day.status <> 'completed' or
       v_day.rating not in ('ممتاز','جيد جدًا','جيد') or
       coalesce(v_day.carry_in,0)<>0 or coalesce(v_day.carry_out,0)<>0 then
      raise exception 'هذا المقرر مرتبط بترحيل أو تقدير غير مكتمل؛ يلزم تصحيحه إداريًا دون تغيير النتائج السابقة.' using errcode='55000';
    end if;
$old$;
 new_check text := $new$
    -- SANABIL_SAFE_CARRY_CORRECTION_20261027: no later assessed data may be changed.
    if v_plan.type='memorization' then
      if v_day.status not in ('completed','carried')
         or v_day.rating not in ('ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع') then
        raise exception 'تعذر تصحيح الحفظ: حالة الحصيلة السابقة غير معتمدة. راجع المشرف.' using errcode='55000';
      end if;
    elsif v_day.status <> 'completed'
         or v_day.rating not in ('ممتاز','جيد جدًا','جيد')
         or coalesce(v_day.carry_in,0)<>0 or coalesce(v_day.carry_out,0)<>0 then
      raise exception 'هذا المقرر مرتبط بترحيل أو تقدير غير مكتمل؛ يلزم تصحيحه إداريًا دون تغيير النتائج السابقة.' using errcode='55000';
    end if;
$new$;
 old_later text := $old$
        and (pd.rating is not null or pd.status<>'planned'
          or coalesce(pd.completed_amount,0)>0 or coalesce(pd.carry_in,0)>0
          or coalesce(pd.carry_out,0)>0)
$old$;
 new_later text := $new$
        and (pd.rating is not null or pd.status<>'planned'
          or coalesce(pd.completed_amount,0)>0
          or coalesce(pd.carry_out,0)>0
          or exists (select 1 from public.outcomes o where o.student_id=pd.student_id and o.date_key=pd.date_key))
$new$;
 old_reset text := $old$
    update public.plan_days set rating=null,completed_amount=0,carry_out=0,
      status='planned',updated_at=now(),updated_by=v_actor
      where id=v_day.id;
$old$;
 new_reset text := $new$
    update public.plan_days set rating=null,completed_amount=0,carry_out=0,
      status='planned',updated_at=now(),updated_by=v_actor
      where id=v_day.id;
    -- Future unrated carry is a projection, not a finalized result.
    -- Clear temporary forward carry in the transaction, then recalculate it.
    if v_plan.type='memorization' then
      update public.plan_days pd set
        carry_in=0,carry_from=null,updated_at=now(),updated_by=v_actor
      where pd.plan_id=v_plan.id and pd.date_key>v_day.date_key
        and pd.status='planned' and pd.rating is null
        and coalesce(pd.completed_amount,0)=0 and coalesce(pd.carry_out,0)=0
        and (coalesce(pd.carry_in,0)<>0 or pd.carry_from is not null);
    end if;
$new$;
 old_post text := $old$
    if coalesce((v_restore->>'ok')::boolean,false) is not true then
      raise exception 'فشل إعادة تطبيق الحصيلة بعد تصحيح المقرر؛ لم تتغير البيانات.' using errcode='55000';
    end if;
$old$;
 new_post text := $new$
    if coalesce((v_restore->>'ok')::boolean,false) is not true then
      raise exception 'فشل إعادة تطبيق الحصيلة بعد تصحيح المقرر؛ لم تتغير البيانات.' using errcode='55000';
    end if;
    if exists (
      select 1 from public.plan_days pd where pd.id=v_day.id
        and (pd.rating is distinct from v_day.rating
          or pd.status is distinct from v_day.status)
    ) then
      raise exception 'لم تتطابق حالة التسميع بعد التصحيح؛ تم التراجع عن العملية.' using errcode='55000';
    end if;
$new$;
BEGIN
 SELECT pg_get_functiondef('public.update_quran_daily_range_guarded(text,integer,integer,integer,integer)'::regprocedure) INTO f;
 IF position('SANABIL_SAFE_CARRY_CORRECTION_20261027' in f)>0 THEN RETURN; END IF;
 IF position(old_check in f)=0 OR position(old_later in f)=0 OR position(old_reset in f)=0 OR position(old_post in f)=0 THEN
   RAISE EXCEPTION 'Live range-correction function changed; refusing unsafe automatic patch';
 END IF;
 f:=replace(f,old_check,new_check);
 f:=replace(f,old_later,new_later);
 f:=replace(f,old_reset,new_reset);
 f:=replace(f,old_post,new_post);
 EXECUTE f;
END $repair$;
