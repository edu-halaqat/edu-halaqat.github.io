-- 2026-10-27: Safeguard the 48-day fixed Aqom curriculum against
-- generic linear reflow, and prefer active successor memorization plans when
-- generating rolling recent reviews. These guards are idempotent.
-- Operational recovery of individual deleted days was performed separately
-- with preservation checks; no student data or IDs belong in this migration.

DO $migration$
DECLARE
 src text;
 marker text := E' SELECT max(date_key),count(*) FILTER (WHERE date_key>v_day.date_key)\n  INTO v_old_last,v_old_future\n FROM public.plan_days WHERE plan_id=v_plan.id;';
 fixed text := $guard$
 -- FIXED_SEQUENCE_AQOM: Only change this curriculum day.
 -- Subsequent fixed lessons are independent, not a continuous Quran cursor.
 IF v_plan.type='memorization'
    AND v_plan.methodology_code='aqom'
    AND coalesce(v_plan.methodology_meta->>'fixedSequence','false')='true' THEN
   UPDATE public.plan_days SET
     target_from=v_from_ref,target_to=v_to_ref,target_amount=v_units,
     carry_in=0,carry_out=0,carry_from=NULL,
     segments=v_segments,display_label=NULL,
     updated_at=now(),updated_by=v_actor
   WHERE id=v_day.id;
   INSERT INTO public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
   VALUES(v_student.org_id,'plan.fixed_sequence_day_adjusted',v_actor,
     'plan_days',v_day.id,
     jsonb_build_object('planId',v_plan.id,'date',v_day.date_key,
       'beforeTo',v_day.target_to,'afterTo',v_to_ref,
       'preservedFutureDays',true,'beforeAmount',v_day.target_amount,'afterAmount',v_units));
   RETURN jsonb_build_object('ok',true,'date',v_day.date_key,
     'planId',v_plan.id,'dayId',v_day.id,'from',v_from_ref,'to',v_to_ref,
     'amount',v_units,'futureRebuilt',0,'futureAdded',0,'futureRemoved',0,
     'preservedFutureDays',true,'lastDate',v_plan.end_date);
 END IF;
$guard$;
BEGIN
 SELECT pg_get_functiondef(
    'public.adjust_daily_plan_assignment_guarded(text,integer,integer,integer)'::regprocedure
 ) INTO src;
 IF position('FIXED_SEQUENCE_AQOM' in src)=0 THEN
   IF position(marker in src)=0 THEN
     RAISE EXCEPTION 'Guarded planner changed; refusing unsafe patch';
   END IF;
   EXECUTE replace(src, marker, fixed||E'\n'||marker);
 END IF;
END $migration$;

DO $migration$
DECLARE
 src text;
 old_clause text :=
   $$where id=v_plan.linked_plan_id and student_id=v_plan.student_id and type='memorization';$$;
 new_clause text :=
   $$where id=v_plan.linked_plan_id and student_id=v_plan.student_id and type='memorization' and status='active';$$;
BEGIN
 SELECT pg_get_functiondef('private.rebuild_recent_review_plan(text)'::regprocedure) INTO src;
 IF position(new_clause in src)=0 THEN
   IF position(old_clause in src)=0 THEN
     RAISE EXCEPTION 'Rolling review planner changed; refusing unsafe patch';
   END IF;
   EXECUTE replace(src,old_clause,new_clause);
 END IF;
END $migration$;
