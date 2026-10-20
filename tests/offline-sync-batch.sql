-- All fixture writes, including idempotency receipts, are rolled back.
DO $test$
DECLARE
  v_uid uuid;
  v_circle text;
  v_id uuid := extensions.gen_random_uuid();
  v_second uuid := extensions.gen_random_uuid();
  v_ops jsonb;
  v_result jsonb;
  v_retry jsonb;
BEGIN
  IF has_function_privilege('anon','public.apply_offline_operations_batch(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous batch execution must be revoked';
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub','',true);
    BEGIN
      PERFORM public.apply_offline_operations_batch('[]'::jsonb);
      RAISE EXCEPTION 'Unauthenticated batch was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    SELECT m.user_id,c.id INTO v_uid,v_circle
    FROM public.memberships m
    JOIN public.profiles p ON p.id=m.user_id AND p.active
    JOIN public.circles c ON c.org_id=m.org_id AND c.active
    WHERE m.active AND m.role='admin' LIMIT 1;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'No active test fixture'; END IF;
    PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.apply_offline_operations_batch('[]'::jsonb);
      RAISE EXCEPTION 'Empty batch was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    v_ops:=jsonb_build_array(jsonb_build_object('id',v_id,'name','save_student_attendance_guarded',
      'payload',jsonb_build_object('p_circle_id',v_circle,'p_date',(now() AT TIME ZONE 'Asia/Riyadh')::date,'p_rows','[]'::jsonb)));
    v_result:=public.apply_offline_operations_batch(v_ops);
    IF v_result#>>'{results,0,ok}' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Valid batch failed: %',v_result;
    END IF;
    v_retry:=public.apply_offline_operations_batch(v_ops);
    IF v_retry#>>'{results,0,result,alreadyApplied}' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Retry did not reuse the idempotency receipt';
    END IF;
    v_result:=public.apply_offline_operations_batch(v_ops || jsonb_build_array(
      jsonb_build_object('id',v_second,'name','not_allowed','payload','{}'::jsonb),
      jsonb_build_object('id',extensions.gen_random_uuid(),'name','not_allowed','payload','{}'::jsonb)));
    IF jsonb_array_length(v_result->'results')<>2
       OR v_result#>>'{results,0,ok}' IS DISTINCT FROM 'true'
       OR v_result#>>'{results,1,ok}' IS DISTINCT FROM 'false' THEN
      RAISE EXCEPTION 'Batch did not stop at its first rejection';
    END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback batch test writes';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END;
$test$;
