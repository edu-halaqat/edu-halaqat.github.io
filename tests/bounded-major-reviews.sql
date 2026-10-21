-- All fixture writes are rolled back, including on assertion failure.
DO $test$
DECLARE u text; dir text; first_j integer; last_j integer; lo integer; hi integer; n integer; covered integer;
 p public.plans%rowtype; original jsonb; snapshot jsonb; r jsonb; result_count integer:=0;
BEGIN
 FOREACH u IN ARRAY ARRAY['juz','hizb','half_hizb','quarter_hizb','surahs','pages','ayahs'] LOOP
  FOREACH dir IN ARRAY ARRAY['toward_fatiha','toward_nas'] LOOP
   FOREACH first_j IN ARRAY ARRAY[1,21,26,30] LOOP
    last_j:=least(first_j+4,30);
    SELECT min(from_index),max(to_index) INTO lo,hi FROM public.quran_divisions WHERE juz_no BETWEEN first_j AND last_j;
    SELECT min(from_index),max(to_index),sum(to_index-from_index+1),count(*) INTO n,covered,result_count,last_j
      FROM private.bounded_review_atoms(u::public.plan_unit,dir::public.plan_direction,first_j,least(first_j+4,30));
    ASSERT n=lo AND covered=hi AND result_count=hi-lo+1 AND last_j>0, 'Range coverage gap or overlap';
   END LOOP;
  END LOOP;
 END LOOP;
 BEGIN
  PERFORM * FROM private.bounded_review_atoms('juz','toward_nas',26,21);
  RAISE EXCEPTION 'Invalid range accepted' USING ERRCODE='P0098';
 EXCEPTION WHEN raise_exception THEN NULL;
 END;
 -- Nested transaction intentionally rolls back the temporary plan and all days.
 BEGIN
  SELECT * INTO p FROM public.plans WHERE type='review' AND status='active' LIMIT 1;
  ASSERT p.id IS NOT NULL, 'Missing fixture scope';
  p.id:='range-regression-'||extensions.gen_random_uuid()::text;
  p.start_date:=current_date;p.end_date:=current_date+14;p.excluded_weekdays:='{}';p.excluded_dates:='{}';
  p.unit:='juz';p.daily_amount:=1;p.type:='review';p.status:='active';p.cycle_enabled:=true;
  p.methodology_meta:='{"reviewRangeMode":"juz","rangeFromJuz":21,"rangeToJuz":25,"reviewStartMode":"surah"}';
  INSERT INTO public.plans SELECT (p).*;
  FOREACH dir IN ARRAY ARRAY['toward_nas','toward_fatiha'] LOOP
   UPDATE public.plans SET direction=dir::public.plan_direction WHERE id=p.id;
   PERFORM private.rebuild_bounded_major_review(p.id,current_date+6,false);
   PERFORM private.rebuild_bounded_major_review(p.id,current_date+14,true);
   SELECT count(*) INTO n FROM public.plan_days WHERE plan_id=p.id;
   ASSERT n=15, 'Append did not produce 15 days';
   ASSERT (SELECT count(distinct cycle_no)=3 FROM public.plan_days WHERE plan_id=p.id), 'Expected three complete cycles';
   ASSERT (SELECT count(distinct target_from)=5 FROM public.plan_days WHERE plan_id=p.id), 'Expected five independent juz assignments';
   SELECT jsonb_agg(jsonb_build_array(date_key,target_from,target_to,cycle_no) ORDER BY date_key) INTO original FROM public.plan_days WHERE plan_id=p.id;
   PERFORM private.rebuild_bounded_major_review(p.id,current_date+14,false);
   SELECT jsonb_agg(jsonb_build_array(date_key,target_from,target_to,cycle_no) ORDER BY date_key) INTO snapshot FROM public.plan_days WHERE plan_id=p.id;
   ASSERT original=snapshot, 'Sync changed curriculum';
   UPDATE public.plan_days SET rating='ممتاز',completed_amount=1,notes='fixture retained' WHERE plan_id=p.id AND date_key=current_date;
   SELECT to_jsonb(d) INTO original FROM public.plan_days d WHERE plan_id=p.id AND date_key=current_date;
   PERFORM private.rebuild_bounded_major_review(p.id,current_date+14,false);
   SELECT to_jsonb(d) INTO snapshot FROM public.plan_days d WHERE plan_id=p.id AND date_key=current_date;
   ASSERT original=snapshot, 'Saved outcome was modified';
   DELETE FROM public.plan_days WHERE plan_id=p.id;
  END LOOP;
  RAISE EXCEPTION 'rollback test fixture' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
 END;
END;
$test$;
