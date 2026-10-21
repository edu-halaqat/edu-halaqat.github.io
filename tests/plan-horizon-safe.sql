-- Run only in a disposable database; fixture contains no production student data.
\set ON_ERROR_STOP on
\ir plan-horizon-fixture.sql
\ir ../db/maintenance/plan-horizon-state.sql
\ir ../db/maintenance/plan-horizon-helpers.sql
\ir ../db/maintenance/plan-horizon-safe.sql
DO $test$
DECLARE r jsonb; original jsonb; retained jsonb; rejected boolean; v text; t text; dir text; dyn boolean;
BEGIN
 FOREACH t IN ARRAY ARRAY['half_hizb','pages'] LOOP
  FOREACH dir IN ARRAY ARRAY['toward_fatiha','toward_nas'] LOOP
   FOREACH dyn IN ARRAY ARRAY[false,true] LOOP
    CONTINUE WHEN dyn AND dir='toward_nas';
    TRUNCATE plan_days,plans;
    INSERT INTO plans(id,org_id,complex_id,circle_id,student_id,type,unit,daily_amount,direction,start_ref,start_date,end_date,status,excluded_weekdays,methodology_code,methodology_meta)
    VALUES('mem','org','complex','circle','student','memorization','lines',3,dir::plan_direction,
      private.quran_target_ref(CASE WHEN dir='toward_nas' THEN 1 ELSE 6216 END,null,null),current_date,current_date+450,'active','{}',
      CASE WHEN dyn THEN 'bir_alwalidayn' END,jsonb_build_object('dynamicLevels',dyn));
    CREATE TEMP TABLE chunks ON COMMIT DROP AS
      SELECT day_seq,from_index,to_index,from_page,to_page,from_line,to_line,actual_lines
      FROM private.quran_memorization_line_chunks(CASE WHEN dir='toward_nas' THEN 1 ELSE 114 END,1,dir::plan_direction,3);
    IF dyn THEN
      TRUNCATE chunks;
      INSERT INTO chunks SELECT day_seq,from_index,to_index,from_page,to_page,from_line,to_line,actual_lines
      FROM private.quran_methodology_line_chunks(114,1,'bir_alwalidayn',null,null);
    END IF;
    INSERT INTO plan_days(plan_id,org_id,complex_id,circle_id,student_id,date_key,target_from,target_to,target_amount,status,cycle_no,segments)
    SELECT 'mem','org','complex','circle','student',current_date+day_seq-1,
      private.quran_target_ref(from_index,from_page,from_line),private.quran_target_ref(to_index,to_page,to_line),actual_lines,'planned',1,private.quran_range_segments(from_index,to_index)
    FROM chunks WHERE day_seq<=451;
    INSERT INTO plans(id,org_id,complex_id,circle_id,student_id,type,unit,daily_amount,direction,start_ref,start_date,end_date,status,excluded_weekdays,linked_plan_id)
    SELECT 'recent',org_id,complex_id,circle_id,student_id,'recent_review','pages',2,'toward_nas',start_ref,start_date,end_date,'active','{}',id FROM plans WHERE id='mem';
    -- Canonical recent-window reference, independent of append helper.
    INSERT INTO plan_days(plan_id,org_id,complex_id,circle_id,student_id,date_key,target_from,target_to,target_amount,status,cycle_no,segments)
    SELECT 'recent','org','complex','circle','student',d.date_key,private.quran_target_ref(w.start_index,null,null),private.quran_target_ref(w.end_index,null,null),w.actual_amount,'planned',1,private.quran_range_segments(w.start_index,w.end_index)
    FROM plan_days d CROSS JOIN LATERAL private.recent_review_window((d.target_to->>'ayahIndex')::integer,'pages',2) w WHERE plan_id='mem';
    INSERT INTO plans(id,org_id,complex_id,circle_id,student_id,type,unit,daily_amount,direction,start_ref,start_date,end_date,status,excluded_weekdays,methodology_meta)
    SELECT 'review',org_id,complex_id,circle_id,student_id,'review',t::plan_unit,1,'toward_nas',start_ref,start_date,end_date,'active','{}','{"reviewStartMode":"lesson","autoMajor":true,"cycleDays":5}' FROM plans WHERE id='mem';
    IF t='pages' THEN PERFORM private.rebuild_linear_major_review_against_recent('review');
    ELSE PERFORM private.rebuild_qpc_major_review_against_recent('review'); END IF;
    SELECT jsonb_agg(to_jsonb(d) ORDER BY id) INTO original FROM plan_days d;
    r:=private.maintain_plan_horizon(ARRAY['student']);
    IF r#>>'{students,0,status}'<>'ok' OR (r#>>'{students,0,rowsRemoved}')::integer<=0 THEN RAISE EXCEPTION 'Proof failed (%,%,%): %',t,dir,dyn,r; END IF;
    IF original IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM plan_days d) THEN RAISE EXCEPTION 'Dry run changed data'; END IF;
    -- Unsupported NULL, empty identifiers and bad bounds must never reach a student.
    rejected:=false; BEGIN PERFORM private.maintain_plan_horizon(NULL); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'NULL accepted'; END IF;
    IF private.maintain_plan_horizon('{}')#>'{students}'<>'[]'::jsonb THEN RAISE EXCEPTION 'Empty batch expanded'; END IF;
    rejected:=false; BEGIN PERFORM private.maintain_plan_horizon(ARRAY['student'],-1); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Negative horizon accepted'; END IF;
    UPDATE plan_days SET notes='protected' WHERE plan_id='mem' AND date_key=current_date+150;
    r:=private.maintain_plan_horizon(ARRAY['student'],120,60,false);
    IF r#>>'{students,0,reason}'<>'protected_future_data' THEN RAISE EXCEPTION 'Protection failed: %',r; END IF;
    UPDATE plan_days SET notes=null WHERE plan_id='mem' AND date_key=current_date+150;
    -- A manual change without a note must be detected by full curriculum equivalence.
    UPDATE plan_days SET target_amount=target_amount+1 WHERE plan_id='mem' AND date_key=current_date+150;
    r:=private.maintain_plan_horizon(ARRAY['student'],120,60,false);
    IF r#>>'{students,0,reason}'<>'curriculum_mismatch' THEN RAISE EXCEPTION 'Manual future not detected: %',r; END IF;
    UPDATE plan_days SET target_amount=target_amount-1 WHERE plan_id='mem' AND date_key=current_date+150;
    SELECT jsonb_agg(to_jsonb(d) ORDER BY id) INTO retained FROM plan_days d WHERE date_key<=current_date+120;
    r:=private.maintain_plan_horizon(ARRAY['student'],120,60,false);
    IF r#>>'{students,0,status}'<>'ok' THEN RAISE EXCEPTION 'Activation failed: %',r; END IF;
    IF retained IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM plan_days d) THEN RAISE EXCEPTION 'Retained data changed'; END IF;
    r:=private.maintain_plan_horizon(ARRAY['student'],120,60,false);
    IF r#>>'{students,0,status}'<>'ok' OR (r#>>'{students,0,rowsRemoved}')::integer<>0 THEN RAISE EXCEPTION 'Repeat failed'; END IF;
    r:=private.maintain_plan_horizon(ARRAY['student'],300,200,false);
    IF r#>>'{students,0,status}'<>'ok' OR (r#>>'{students,0,memorizationDaysAdded}')::integer<=0 THEN RAISE EXCEPTION 'Refill failed: %',r; END IF;
    DROP TABLE chunks;
   END LOOP;
  END LOOP;
 END LOOP;
END;
$test$;
SELECT 'PASS: 6 curriculum combinations; rollback, scope, protected/manual future, idempotence and refill' AS result;
