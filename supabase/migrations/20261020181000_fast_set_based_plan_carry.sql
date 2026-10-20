-- Set-based equivalent of the original sequential carry engine.
-- Historic ratings stay unchanged; ungraded days keep their completed_amount.
CREATE OR REPLACE FUNCTION private.recalculate_plan_carry(p_plan_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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
