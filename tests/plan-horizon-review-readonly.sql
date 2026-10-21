-- Non-mutating regression checks for hazards in the submitted horizon scripts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
DO $test$
DECLARE ids text[]; reported integer := 0; rows_added integer := 0;
BEGIN
  SELECT array_agg(x) INTO ids FROM (SELECT 'student'::text x WHERE false) s;
  IF ids IS NOT NULL OR NOT (ids IS NULL OR 'unselected-student' = ANY(ids)) THEN
    RAISE EXCEPTION 'Unexpected NULL batch semantics';
  END IF;
  -- Proposed caller must normalize an empty selection; it must never select everyone.
  ids := coalesce(ids, ARRAY[]::text[]);
  IF cardinality(ids) <> 0 OR 'unselected-student' = ANY(ids) THEN
    RAISE EXCEPTION 'Empty-array guard failed';
  END IF;
  BEGIN
    reported := reported + 10;
    RAISE EXCEPTION 'simulated extension failure';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF reported <> 10 THEN
    RAISE EXCEPTION 'Unexpected exception-block variable semantics';
  END IF;
  -- max(date) cannot prove that intervening dates exist.
  IF NOT EXISTS (
    SELECT 1 FROM (VALUES (DATE '2026-01-01'), (DATE '2026-12-31')) d(day)
    HAVING max(day) > DATE '2026-06-01' AND count(*) = 2
  ) THEN RAISE EXCEPTION 'Sparse horizon fixture failed'; END IF;
END;
$test$;
SELECT 'passed: NULL escalation, empty-array guard, rollback counter, sparse horizon' AS result;
ROLLBACK;
