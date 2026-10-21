-- Install only after the PostgreSQL regression gate has passed. Empty enrollment is a no-op.
BEGIN;
CREATE OR REPLACE FUNCTION private.run_plan_horizon_refill()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE p record; r jsonb; results jsonb:='[]';
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('sanabil-plan-horizon-refill',0)) THEN
   RETURN jsonb_build_object('busy',true);
 END IF;
 FOR p IN SELECT * FROM private.plan_horizon_targets WHERE enabled AND next_check_at<=now()
   ORDER BY next_check_at,student_id LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
   r:=private.maintain_plan_horizon(ARRAY[p.student_id],p.horizon_days,p.trigger_days,false);
   UPDATE private.plan_horizon_targets SET last_checked_at=now(),next_check_at=now()+interval '1 day',last_result=r
   WHERE student_id=p.student_id;
   results:=results||jsonb_build_array(r);
 END LOOP;
 RETURN results;
END;
$fn$;
REVOKE ALL ON FUNCTION private.run_plan_horizon_refill() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('sanabil-plan-horizon-refill','17 * * * *',
  $$SET statement_timeout='45s'; SET lock_timeout='1s'; SELECT private.run_plan_horizon_refill();$$);
COMMIT;
