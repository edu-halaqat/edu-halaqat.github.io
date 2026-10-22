-- Central, bounded, administrator-only performance analytics.
-- Metadata only: never store form values, grades, student names, request URLs or JWTs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20000ms';

CREATE TABLE IF NOT EXISTS private.client_performance_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 event_kind text NOT NULL,
 operation text NOT NULL,
 area text NOT NULL,
 status text NOT NULL CHECK (status IN ('ok','error','queued')),
 duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 120000),
 device_class text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_perf_time_idx
 ON private.client_performance_events(created_at DESC);
CREATE INDEX IF NOT EXISTS client_perf_actor_time_idx
 ON private.client_performance_events(actor_id,created_at DESC);
REVOKE ALL ON private.client_performance_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_client_performance(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid := auth.uid();
 v_count integer := 0;
 v_existing integer;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
  RAISE EXCEPTION 'يجب تسجيل الدخول بحساب نشط.' USING ERRCODE='42501';
 END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array'
   OR jsonb_array_length(p_events)>30 THEN
   RAISE EXCEPTION 'دفعة قياس غير صالحة.' USING ERRCODE='22023';
 END IF;
 SELECT count(*) INTO v_existing
 FROM private.client_performance_events
 WHERE actor_id=v_actor AND created_at>now()-interval '5 minutes';
 IF v_existing >= 120 THEN RETURN jsonb_build_object('accepted',0,'limited',true);END IF;

 INSERT INTO private.client_performance_events
  (actor_id,event_kind,operation,area,status,duration_ms,device_class)
 SELECT v_actor,
   e->>'kind',e->>'operation',e->>'area',
   e->>'status',(e->>'ms')::integer,e->>'device'
 FROM jsonb_array_elements(p_events) AS e
 WHERE e->>'kind' IN ('action','rpc','navigation','render','save','ui')
  AND (e->>'operation') ~ '^[A-Za-z0-9_:#-]{1,80}$'
  AND (e->>'area') ~ '^[A-Za-z0-9_-]{1,32}$'
  AND e->>'status' IN ('ok','error','queued')
  AND (e->>'ms') ~ '^[0-9]{1,6}$'
  AND (e->>'ms')::integer BETWEEN 0 AND 120000
  AND e->>'device' IN ('mobile','tablet','desktop')
 LIMIT LEAST(30,120-v_existing);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('accepted',v_count,'limited',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_performance_admin(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.active_user() OR NOT EXISTS(
  SELECT 1 FROM public.memberships m WHERE m.user_id=auth.uid()
  AND m.active AND m.role='admin'
 ) THEN
  RAISE EXCEPTION 'هذه القياسات مخصصة لمدير النظام.' USING ERRCODE='42501';
 END IF;
 IF p_hours IS NULL OR p_hours NOT BETWEEN 1 AND 168 THEN
  RAISE EXCEPTION 'فترة القياس غير صالحة.' USING ERRCODE='22023';
 END IF;
 WITH scoped AS MATERIALIZED (
   SELECT e.actor_id,e.operation,e.event_kind,e.area,e.status,e.duration_ms,e.device_class,e.created_at
   FROM private.client_performance_events e
   WHERE e.created_at >= now() - make_interval(hours=>p_hours)
 )
 SELECT jsonb_build_object(
  'events',(SELECT count(*) FROM scoped),
  'errors',(SELECT count(*) FROM scoped WHERE status='error'),
  'actors',(SELECT count(DISTINCT actor_id) FROM scoped),
  'byActor',coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.events DESC)
    FROM (
      SELECT s.actor_id::text AS actor_id,
       coalesce(nullif(p.full_name,''),nullif(p.display_name,''),'حساب مستخدم') AS actor_name,
       count(*) AS events,
       count(*) FILTER(WHERE s.status='error') AS errors,
       round(avg(s.duration_ms),1) AS mean_ms,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY s.duration_ms) AS p95_ms
      FROM scoped s JOIN public.profiles p ON p.id=s.actor_id
      GROUP BY s.actor_id,p.full_name,p.display_name
      ORDER BY count(*) DESC LIMIT 80
    ) x
  ),'[]'::jsonb),
  'byOperation',coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.errors DESC,x.p95_ms DESC)
    FROM (
      SELECT operation,area,event_kind,
       count(*) AS events,
       count(*) FILTER(WHERE status='error') AS errors,
       round(avg(duration_ms),1) AS mean_ms,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
      FROM scoped GROUP BY operation,area,event_kind
      ORDER BY count(*) DESC LIMIT 100
    ) x
  ),'[]'::jsonb),
  'recentFailures',coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
    FROM (
      SELECT e.created_at,e.actor_id::text AS actor_id,
       coalesce(nullif(p.full_name,''),nullif(p.display_name,''),'حساب مستخدم') AS actor_name,
       e.operation,e.area,e.event_kind,e.duration_ms,e.device_class
      FROM scoped e JOIN public.profiles p ON p.id=e.actor_id
      WHERE e.status='error'
      ORDER BY e.created_at DESC LIMIT 50
    ) x
  ),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_client_performance(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_client_performance(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.client_performance_admin(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_performance_admin(integer) TO authenticated;
COMMIT;
