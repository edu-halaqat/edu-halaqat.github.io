DO $test$
DECLARE before_hash text;after_hash text;r jsonb;d record;dir public.plan_direction;u public.plan_unit;
BEGIN
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) INTO before_hash FROM public.plan_days x WHERE student_id='4f84514e-0fb2-42d3-9596-fad5beee5af3' AND (date_key<'2026-10-29' OR rating IS NOT NULL OR status<>'planned');
 CREATE TEMP TABLE _test_mem_ranges ON COMMIT DROP AS SELECT * FROM private.memorized_review_ranges('4f84514e-0fb2-42d3-9596-fad5beee5af3','2026-10-29');
 FOREACH dir IN ARRAY ARRAY['toward_nas','toward_fatiha']::public.plan_direction[] LOOP
 FOREACH u IN ARRAY ARRAY['hizb','juz','pages','surahs','ayahs']::public.plan_unit[] LOOP
 UPDATE public.plans SET direction=dir,unit=u,daily_amount=20 WHERE id='d6408897-00b0-473a-ad18-8c8605c36605';
 r:=private.rebuild_memorized_major('d6408897-00b0-473a-ad18-8c8605c36605');
 IF (r->>'generatedDays')::integer<1 THEN RAISE EXCEPTION 'missing review % %',dir,u;END IF;
 IF EXISTS(SELECT 1 FROM public.plan_days pd
 WHERE pd.plan_id='d6408897-00b0-473a-ad18-8c8605c36605' AND pd.date_key>='2026-10-29' AND
 (select coalesce(sum(least(rr.hi,(pd.target_to->>'ayahIndex')::integer)-greatest(rr.lo,(pd.target_from->>'ayahIndex')::integer)+1),0) FROM _test_mem_ranges rr WHERE rr.hi>=(pd.target_from->>'ayahIndex')::integer AND rr.lo<=(pd.target_to->>'ayahIndex')::integer)
 <> (pd.target_to->>'ayahIndex')::integer-(pd.target_from->>'ayahIndex')::integer+1) THEN RAISE EXCEPTION 'unmemorized verse % %',dir,u;END IF;
 END LOOP;END LOOP;
 PERFORM private.rebuild_recent_review_plan('62d2004c-429c-47e9-99f0-cd9cc538579d');
 IF NOT EXISTS(SELECT 1 FROM public.plan_days WHERE plan_id='62d2004c-429c-47e9-99f0-cd9cc538579d' AND date_key='2026-10-29') THEN RAISE EXCEPTION 'recent missing on skipped memorization day';END IF;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) INTO after_hash FROM public.plan_days x WHERE student_id='4f84514e-0fb2-42d3-9596-fad5beee5af3' AND (date_key<'2026-10-29' OR rating IS NOT NULL OR status<>'planned');
 IF before_hash<>after_hash THEN RAISE EXCEPTION 'history changed';END IF;
END;$test$;
SELECT 'passed directions, five units, oversized amount, missing recent day, coverage, preserved history' result;
