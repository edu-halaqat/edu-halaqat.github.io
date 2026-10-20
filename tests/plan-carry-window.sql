CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.plan_days(
 id text primary key, plan_id text NOT NULL,date_key date NOT NULL,
 rating text,target_from jsonb,target_amount numeric(8,2),completed_amount numeric(8,2),
 carry_in numeric(8,2),carry_from jsonb,carry_out numeric(8,2),status text,updated_at timestamptz);
CREATE UNIQUE INDEX ON public.plan_days(plan_id,date_key);

CREATE OR REPLACE FUNCTION private.recalculate_plan_carry_reference(p_plan_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  WITH RECURSIVE
  sorted AS MATERIALIZED (
    SELECT row_number() OVER (ORDER BY date_key,id)::bigint AS n,
           id,rating,target_from,target_amount,completed_amount
    FROM public.plan_days
    WHERE plan_id=p_plan_id
  ),
  seq(n,id,rating,target_from,target_amount,incoming,origin) AS (
    SELECT s.n,s.id,s.rating,s.target_from,s.target_amount,
           0::numeric(8,2),null::jsonb
    FROM sorted s WHERE s.n=1
    UNION ALL
    SELECT s.n,s.id,s.rating,s.target_from,s.target_amount,
           (CASE WHEN c.rating IN ('لم يحفظ','لم يسمع')
             THEN coalesce(c.target_amount,0)+c.incoming
             ELSE 0 END)::numeric(8,2),
           (CASE WHEN c.rating IN ('لم يحفظ','لم يسمع')
             THEN coalesce(c.origin,c.target_from)
             ELSE null::jsonb END)
    FROM seq c JOIN sorted s ON s.n=c.n+1
  ),
  expected AS MATERIALIZED (
    SELECT s.id,
           c.incoming AS carry_in,
           c.origin AS carry_from,
           CASE WHEN c.rating IN ('ممتاز','جيد جدًا','جيد')
                   THEN coalesce(c.target_amount,0)+c.incoming
                WHEN c.rating IN ('لم يحفظ','لم يسمع') THEN 0
                ELSE s.completed_amount END AS completed_amount,
           CASE WHEN c.rating IN ('لم يحفظ','لم يسمع')
                   THEN coalesce(c.target_amount,0)+c.incoming ELSE 0 END AS carry_out,
           CASE WHEN c.rating IN ('ممتاز','جيد جدًا','جيد') THEN 'completed'
                WHEN c.rating IN ('لم يحفظ','لم يسمع') THEN 'carried'
                ELSE 'planned' END AS status
    FROM sorted s JOIN seq c ON c.id=s.id
  )
  UPDATE public.plan_days d
  SET carry_in=e.carry_in, carry_from=e.carry_from,
      completed_amount=e.completed_amount, carry_out=e.carry_out,
      status=e.status, updated_at=now()
  FROM expected e
  WHERE d.id=e.id AND (
    d.carry_in,d.carry_from,d.completed_amount,d.carry_out,d.status
  ) IS DISTINCT FROM (
    e.carry_in,e.carry_from,e.completed_amount,e.carry_out,e.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.recalculate_plan_carry(p_plan_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  WITH sorted AS MATERIALIZED (
    SELECT row_number() OVER (ORDER BY date_key,id)::bigint AS n,
           id,rating,target_from,target_amount,completed_amount
    FROM public.plan_days WHERE plan_id=p_plan_id
  ),
  grouped AS (
    SELECT s.*,coalesce(sum(CASE WHEN rating IN ('لم يحفظ','لم يسمع') THEN 0 ELSE 1 END)
      OVER (ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS chain
    FROM sorted s
  ),
  amounts AS (
    SELECT g.*,
      coalesce(sum(coalesce(target_amount,0))
        OVER (PARTITION BY chain ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::numeric(8,2) AS incoming,
      min(n) FILTER (WHERE target_from IS NOT NULL)
        OVER (PARTITION BY chain ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS origin_n
    FROM grouped g
  ),
  expected AS MATERIALIZED (
    SELECT c.id,c.incoming AS carry_in,o.target_from AS carry_from,
      CASE WHEN c.rating IN ('ممتاز','جيد جدًا','جيد')
        THEN coalesce(c.target_amount,0)+c.incoming
        WHEN c.rating IN ('لم يحفظ','لم يسمع') THEN 0
        ELSE c.completed_amount END AS completed_amount,
      CASE WHEN c.rating IN ('لم يحفظ','لم يسمع')
        THEN coalesce(c.target_amount,0)+c.incoming ELSE 0 END AS carry_out,
      CASE WHEN c.rating IN ('ممتاز','جيد جدًا','جيد') THEN 'completed'
        WHEN c.rating IN ('لم يحفظ','لم يسمع') THEN 'carried'
        ELSE 'planned' END AS status
    FROM amounts c LEFT JOIN sorted o ON o.n=c.origin_n
  )
  UPDATE public.plan_days d
  SET carry_in=e.carry_in,carry_from=e.carry_from,
      completed_amount=e.completed_amount,carry_out=e.carry_out,
      status=e.status,updated_at=now()
  FROM expected e
  WHERE d.id=e.id AND (
    d.carry_in,d.carry_from,d.completed_amount,d.carry_out,d.status
  ) IS DISTINCT FROM (
    e.carry_in,e.carry_from,e.completed_amount,e.carry_out,e.status
  );
END;
$function$;

WITH fixture AS MATERIALIZED (
 SELECT n::text AS id,'fixture'::text AS plan_id,date '2026-01-01'+n AS date_key,
 CASE WHEN n<=100 THEN 'لم يحفظ' WHEN n<=200 THEN NULL WHEN n<=300 THEN 'ممتاز'
 ELSE (ARRAY['ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع',NULL,'unknown'])[1+(n*17%7)] END AS rating,
 CASE WHEN n%11=0 OR n=1 THEN NULL::jsonb WHEN n%13=0 THEN 'null'::jsonb ELSE jsonb_build_object('ayahIndex',n) END AS target_from,
 (CASE WHEN n%19=0 THEN NULL ELSE (n%100)::numeric/10 END)::numeric(8,2) AS target_amount,
 (CASE WHEN n%23=0 THEN NULL ELSE (n%17)::numeric/10 END)::numeric(8,2) AS completed_amount
 FROM generate_series(1,3000) n
)
INSERT INTO public.plan_days(id,plan_id,date_key,rating,target_from,target_amount,completed_amount)
SELECT id,plan_id,date_key,rating,target_from,target_amount,completed_amount FROM fixture;
CREATE TEMP TABLE original_rows AS TABLE public.plan_days;
SELECT private.recalculate_plan_carry_reference('fixture');
CREATE TEMP TABLE expected_rows AS TABLE public.plan_days;
TRUNCATE public.plan_days;
INSERT INTO public.plan_days SELECT * FROM original_rows;
SELECT private.recalculate_plan_carry('fixture');
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.plan_days n FULL JOIN expected_rows o USING(id)
 WHERE to_jsonb(n)-'updated_at' IS DISTINCT FROM to_jsonb(o)-'updated_at')
 THEN RAISE EXCEPTION 'Initial carry results differ'; END IF;
END $test$;
CREATE TEMP TABLE before_noop AS SELECT id,ctid AS tuple_id FROM public.plan_days;
SELECT private.recalculate_plan_carry('fixture');
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.plan_days n JOIN before_noop b USING(id) WHERE n.ctid<>b.tuple_id)
 THEN RAISE EXCEPTION 'Unchanged rows were rewritten'; END IF;
END $test$;
-- A correction to an earlier rated day must change downstream carry identically.
UPDATE public.plan_days SET rating='جيد' WHERE id='20';
CREATE TEMP TABLE correction_input AS TABLE public.plan_days;
SELECT private.recalculate_plan_carry_reference('fixture');
TRUNCATE expected_rows;
INSERT INTO expected_rows SELECT * FROM public.plan_days;
TRUNCATE public.plan_days;
INSERT INTO public.plan_days SELECT * FROM correction_input;
SELECT private.recalculate_plan_carry('fixture');
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.plan_days n FULL JOIN expected_rows o USING(id)
 WHERE to_jsonb(n)-'updated_at' IS DISTINCT FROM to_jsonb(o)-'updated_at')
 THEN RAISE EXCEPTION 'Historical correction results differ'; END IF;
END $test$;
SELECT private.recalculate_plan_carry('missing-plan');
SELECT 'PASS: 3000 synthetic days; all ratings, NULLs, decimals, long failure chains, historical edits, unchanged-row preservation, empty plan' AS result;
