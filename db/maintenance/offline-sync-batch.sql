-- Batch transport only. Each operation retains the existing authorization,
-- idempotency ledger and transaction boundary. Stop at the first rejection.
CREATE OR REPLACE FUNCTION public.apply_offline_operations_batch(p_operations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_error text;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يلزم تسجيل الدخول.' USING ERRCODE='42501';
  END IF;
  IF p_operations IS NULL OR jsonb_typeof(p_operations)<>'array' THEN
    RAISE EXCEPTION 'دفعة المزامنة غير صالحة.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_operations) NOT BETWEEN 1 AND 5
     OR octet_length(p_operations::text)>600000 THEN
    RAISE EXCEPTION 'تجاوزت دفعة المزامنة الحجم المسموح.' USING ERRCODE='22023';
  END IF;
  -- Prevent two tabs replaying overlapping batches in different orders.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sanabil-offline-batch:'||v_uid::text,0));
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_operations)
  LOOP
    BEGIN
      IF jsonb_typeof(v_item)<>'object' OR v_item->>'id' IS NULL
         OR v_item->>'name' IS NULL OR v_item->'payload' IS NULL THEN
        RAISE EXCEPTION 'عملية المزامنة غير صالحة.' USING ERRCODE='22023';
      END IF;
      v_result := public.apply_offline_operation(
        (v_item->>'id')::uuid,v_item->>'name',v_item->'payload');
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id',v_item->>'id','ok',true,'result',v_result));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT,v_code=RETURNED_SQLSTATE;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id',v_item->>'id','ok',false,'error',jsonb_build_object('code',v_code,'message',v_error)));
      EXIT;
    END;
  END LOOP;
  RETURN jsonb_build_object('results',v_results);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_offline_operations_batch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_offline_operations_batch(jsonb) TO authenticated;
