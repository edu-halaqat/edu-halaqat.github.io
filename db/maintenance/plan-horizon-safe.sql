-- Opt-in administrative API. No existing functions are replaced; no cron is installed.
-- Use dry_run=true first. Unsupported students are reported, never partly processed.
BEGIN;
CREATE OR REPLACE FUNCTION private.maintain_plan_horizon(
 p_students text[], p_horizon integer DEFAULT 120, p_trigger integer DEFAULT 60,
 p_dry_run boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 sid text; p record; mem public.plans%rowtype; recent public.plans%rowtype;
 ids text[]; cutoff date; today date:=timezone('Asia/Riyadh',now())::date;
 last_mem date; through_date date; before_json jsonb; after_json jsonb;
 curriculum_before jsonb; curriculum_after jsonb; removed integer; added integer;
 n integer; result jsonb; results jsonb:='[]';
BEGIN
 IF p_students IS NULL OR cardinality(p_students)>25 OR array_ndims(p_students)>1
   OR EXISTS(SELECT 1 FROM unnest(p_students) x WHERE x IS NULL OR btrim(x)='')
   OR p_horizon IS NULL OR p_trigger IS NULL OR p_dry_run IS NULL
   OR p_horizon NOT BETWEEN 90 AND 365 OR p_trigger NOT BETWEEN 15 AND p_horizon-15 THEN
   RAISE EXCEPTION 'Explicit student list (max 25) and valid horizon/trigger/dry-run are required';
 END IF;
 IF NOT p_dry_run AND NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='sanabil-plan-horizon-refill' AND active) THEN
   RAISE EXCEPTION 'Refill scheduler must be enabled before trimming';
 END IF;
 cutoff:=today+p_horizon;
 FOR sid IN SELECT DISTINCT x FROM unnest(p_students) x ORDER BY x LOOP
   result:=NULL;
   BEGIN
     -- Same student lock as plan creation; do not wait behind an active teacher edit.
     IF NOT pg_try_advisory_xact_lock(hashtextextended('sanabil-student-plans:'||sid,0)) THEN
       RAISE EXCEPTION 'student_busy';
     END IF;
     PERFORM 1 FROM public.plans WHERE student_id=sid ORDER BY id FOR UPDATE NOWAIT;
     SELECT array_agg(id ORDER BY id) INTO ids FROM public.plans WHERE student_id=sid AND status='active';
     IF ids IS NULL THEN RAISE EXCEPTION 'no_active_plans'; END IF;
     SELECT count(*) INTO n FROM public.plans WHERE id=any(ids) AND type='memorization';
     IF n<>1 THEN RAISE EXCEPTION 'one_memorization_plan_required'; END IF;
     SELECT * INTO mem FROM public.plans WHERE id=any(ids) AND type='memorization';
     IF mem.unit::text<>'lines' OR coalesce(mem.cycle_enabled,false) OR mem.start_date>today
       OR mem.end_date IS NULL THEN RAISE EXCEPTION 'unsupported_memorization'; END IF;
     IF EXISTS(SELECT 1 FROM public.plans WHERE id=any(ids) AND type<>'memorization' AND end_date>mem.end_date) THEN
       RAISE EXCEPTION 'dependent_plan_outlives_memorization';
     END IF;
     SELECT count(*) INTO n FROM public.plans WHERE id=any(ids) AND type='recent_review';
     IF n>1 THEN RAISE EXCEPTION 'ambiguous_recent_review'; END IF;
     SELECT * INTO recent FROM public.plans WHERE id=any(ids) AND type='recent_review';
     IF recent.id IS NOT NULL AND (recent.linked_plan_id IS DISTINCT FROM mem.id
       OR recent.unit::text NOT IN ('pages','ayahs','surahs')) THEN RAISE EXCEPTION 'unsupported_recent_review'; END IF;
     IF EXISTS(SELECT 1 FROM public.plans WHERE id=any(ids) AND
       (type NOT IN ('memorization','recent_review','review') OR
        (type='review' AND (recent.id IS NULL OR unit::text NOT IN
         ('quarter_hizb','half_hizb','hizb','juz','pages','ayahs','surahs') OR
         coalesce(methodology_meta->>'reviewStartMode','legacy') NOT IN ('lesson','surah'))))) THEN
       RAISE EXCEPTION 'unsupported_review_dependency';
     END IF;
     PERFORM 1 FROM public.plan_days WHERE plan_id=any(ids) ORDER BY plan_id,date_key FOR UPDATE NOWAIT;
     -- Refuse the whole student if a far-future row contains work or a date has an outcome.
     IF EXISTS(SELECT 1 FROM public.plan_days d WHERE plan_id=any(ids) AND date_key>cutoff AND
       (status IS DISTINCT FROM 'planned' OR rating IS NOT NULL OR notes IS NOT NULL
        OR coalesce(completed_amount,0)<>0 OR coalesce(carry_in,0)<>0 OR coalesce(carry_out,0)<>0 OR carry_from IS NOT NULL))
       OR EXISTS(SELECT 1 FROM public.outcomes WHERE student_id=sid AND date_key>cutoff)
       OR EXISTS(SELECT 1 FROM public.student_attendance WHERE student_id=sid AND date_key>cutoff) THEN
       RAISE EXCEPTION 'protected_future_data';
     END IF;
     SELECT max(date_key) INTO last_mem FROM public.plan_days WHERE plan_id=mem.id AND date_key<=cutoff;
     IF last_mem IS NULL THEN RAISE EXCEPTION 'missing_anchor'; END IF;
     -- A protected/sparse future row must never masquerade as a complete window.
     IF EXISTS(SELECT 1 FROM generate_series(greatest(today,mem.start_date),least(last_mem,mem.end_date),interval '1 day') g
       WHERE NOT(extract(dow FROM g)::smallint=any(coalesce(mem.excluded_weekdays,'{}'::smallint[])))
       AND NOT(g::date=any(coalesce(mem.excluded_dates,'{}'::date[])))
       AND NOT EXISTS(SELECT 1 FROM public.plan_days WHERE plan_id=mem.id AND date_key=g::date)) THEN
       RAISE EXCEPTION 'gap_in_retained_window';
     END IF;
     SELECT jsonb_agg(to_jsonb(d) ORDER BY plan_id,date_key) INTO before_json
       FROM public.plan_days d WHERE student_id=sid AND (NOT(plan_id=any(ids)) OR date_key<=cutoff);
     -- Validate every removed curriculum row, not merely the first 300 days.
     SELECT jsonb_agg(jsonb_build_array(plan_id,date_key,target_from,target_to,target_amount,cycle_no,segments,display_label)
       ORDER BY plan_id,date_key),max(date_key) INTO curriculum_before,through_date
       FROM public.plan_days WHERE plan_id=any(ids) AND date_key>cutoff;
     removed:=0; added:=0;
     IF curriculum_before IS NOT NULL THEN
       -- This proof runs in a subtransaction. Even on success, roll it back so retained
       -- row ids, audit metadata and plan metadata are never replaced by the proof.
       BEGIN
         DELETE FROM public.plan_days WHERE plan_id=any(ids) AND date_key>cutoff;
         PERFORM private.horizon_append_memorization(mem.id,through_date);
         IF recent.id IS NOT NULL THEN PERFORM private.horizon_append_recent(recent.id,mem.id,cutoff+1); END IF;
         FOR p IN SELECT * FROM public.plans WHERE id=any(ids) AND type='review' ORDER BY id LOOP
           IF p.unit::text IN ('pages','ayahs','surahs') THEN PERFORM private.horizon_append_linear(p.id,through_date);
           ELSE PERFORM private.horizon_append_qpc(p.id,through_date); END IF;
         END LOOP;
         SELECT jsonb_agg(jsonb_build_array(plan_id,date_key,target_from,target_to,target_amount,cycle_no,segments,display_label)
           ORDER BY plan_id,date_key) INTO curriculum_after FROM public.plan_days WHERE plan_id=any(ids) AND date_key>cutoff;
         IF curriculum_after IS DISTINCT FROM curriculum_before THEN RAISE EXCEPTION 'curriculum_mismatch'; END IF;
         RAISE EXCEPTION USING ERRCODE='ZP001',MESSAGE='proof_complete';
       EXCEPTION WHEN SQLSTATE 'ZP001' THEN NULL;
       END;
       DELETE FROM public.plan_days WHERE plan_id=any(ids) AND date_key>cutoff;
       GET DIAGNOSTICS removed=ROW_COUNT;
     ELSIF last_mem<today+p_trigger AND last_mem<mem.end_date THEN
       added:=private.horizon_append_memorization(mem.id,cutoff);
       IF recent.id IS NOT NULL THEN PERFORM private.horizon_append_recent(recent.id,mem.id,last_mem+1); END IF;
       FOR p IN SELECT * FROM public.plans WHERE id=any(ids) AND type='review' ORDER BY id LOOP
         IF p.unit::text IN ('pages','ayahs','surahs') THEN PERFORM private.horizon_append_linear(p.id,cutoff);
         ELSE PERFORM private.horizon_append_qpc(p.id,cutoff); END IF;
       END LOOP;
     END IF;
     -- Existing retained rows must be byte-for-byte equivalent; new dates are allowed.
     SELECT jsonb_agg(to_jsonb(d) ORDER BY d.plan_id,d.date_key) INTO after_json
       FROM public.plan_days d WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(before_json) b WHERE b->>'id'=d.id);
     IF after_json IS DISTINCT FROM before_json THEN RAISE EXCEPTION 'retained_rows_changed'; END IF;
     UPDATE public.plans pl SET materialized_through=x.last_date
       FROM (SELECT plan_id,max(date_key) last_date FROM public.plan_days WHERE plan_id=any(ids) GROUP BY plan_id) x
       WHERE pl.id=x.plan_id AND pl.materialized_through IS DISTINCT FROM x.last_date;
     result:=jsonb_build_object('studentId',sid,'status','ok','rowsRemoved',removed,'memorizationDaysAdded',added,'dryRun',p_dry_run);
     IF p_dry_run THEN RAISE EXCEPTION USING ERRCODE='ZP002',MESSAGE='dry_run_complete'; END IF;
     INSERT INTO private.plan_horizon_targets(student_id,horizon_days,trigger_days,enabled,next_check_at,last_checked_at,last_result)
     VALUES(sid,p_horizon,p_trigger,true,now()+interval '1 day',now(),result)
     ON CONFLICT(student_id) DO UPDATE SET horizon_days=excluded.horizon_days,trigger_days=excluded.trigger_days,enabled=true,next_check_at=excluded.next_check_at,last_checked_at=excluded.last_checked_at,last_result=excluded.last_result;
   EXCEPTION
     WHEN SQLSTATE 'ZP002' THEN NULL;
     WHEN OTHERS THEN result:=jsonb_build_object('studentId',sid,'status','skipped','reason',SQLERRM,'rowsRemoved',0,'memorizationDaysAdded',0,'dryRun',p_dry_run);
   END;
   results:=results||jsonb_build_array(result);
 END LOOP;
 RETURN jsonb_build_object('dryRun',p_dry_run,'students',results);
END;
$fn$;
REVOKE ALL ON FUNCTION private.maintain_plan_horizon(text[],integer,integer,boolean) FROM PUBLIC,anon,authenticated;
COMMIT;
