-- Central activity telemetry; records no submitted values, student names or grades.
CREATE TABLE IF NOT EXISTS public.platform_activity_events (
 id bigint generated always as identity primary key,
 event_id uuid not null unique,
 actor_uid uuid not null,
 session_id uuid not null,
 kind text not null check(kind in ('click','change','submit','navigation','operation','error')),
 view_key text not null check(char_length(view_key) between 1 and 60),
 action_key text not null check(char_length(action_key) between 1 and 100),
 duration_ms integer check(duration_ms between 0 and 120000),
 succeeded boolean,
 device_kind text not null check(device_kind in ('mobile','tablet','desktop')),
 created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS platform_activity_created_idx ON public.platform_activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_activity_actor_created_idx ON public.platform_activity_events(actor_uid,created_at DESC);
ALTER TABLE public.platform_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_activity_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.platform_activity_events TO authenticated;
DROP POLICY IF EXISTS platform_activity_admin_read ON public.platform_activity_events;
CREATE POLICY platform_activity_admin_read ON public.platform_activity_events FOR SELECT TO authenticated
 USING(private.has_role('admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.get_platform_activity_events(p_limit integer DEFAULT 150)
 RETURNS TABLE(event_id uuid, actor_uid uuid, actor_name text, actor_role text, kind text, view_key text, action_key text, duration_ms integer, succeeded boolean, device_kind text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
BEGIN
 IF (select auth.uid()) IS NULL OR NOT private.has_role('admin'::public.app_role) THEN
  RAISE EXCEPTION 'مدير النظام فقط يستطيع الاطلاع على هذه السجلات' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT e.event_id,e.actor_uid,
  coalesce(nullif(p.display_name,''),nullif(p.full_name,''),nullif(t.full_name,''),'مستخدم '||left(e.actor_uid::text,8))::text,
  coalesce(p.role,m.role::text,'')::text,
  e.kind,e.view_key,e.action_key,e.duration_ms,e.succeeded,e.device_kind,e.created_at
 FROM public.platform_activity_events e
 LEFT JOIN public.profiles p ON p.id=e.actor_uid
 LEFT JOIN LATERAL (SELECT full_name FROM public.teachers WHERE user_id=e.actor_uid AND active=true ORDER BY updated_at DESC LIMIT 1) t ON true
 LEFT JOIN LATERAL (SELECT role FROM public.memberships WHERE user_id=e.actor_uid AND active=true ORDER BY created_at DESC LIMIT 1) m ON true
 ORDER BY e.created_at DESC LIMIT greatest(1,least(coalesce(p_limit,150),500));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_platform_activity_batch(p_events jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
DECLARE
 v_actor uuid := (select auth.uid());
 v_event jsonb;
 v_inserted integer := 0;
 v_kind text;
 v_view text;
 v_action text;
 v_device text;
 v_ms integer;
BEGIN
 IF v_actor IS NULL OR NOT private.active_user() THEN
  RAISE EXCEPTION 'حساب غير مصرح له' USING ERRCODE='42501';
 END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array'
    OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 25
    OR octet_length(p_events::text)>12000 THEN
  RAISE EXCEPTION 'دفعة القياس غير صالحة' USING ERRCODE='22023';
 END IF;
 FOR v_event IN SELECT value FROM pg_catalog.jsonb_array_elements(p_events) LOOP
  v_kind:=v_event->>'kind';
  v_view:=v_event->>'view';
  v_action:=v_event->>'action';
  v_device:=v_event->>'device';
  IF v_kind NOT IN ('click','change','submit','navigation','operation','error')
    OR v_kind IS NULL
    OR v_view IS NULL OR length(v_view) NOT BETWEEN 1 AND 60
    OR v_action IS NULL OR length(v_action) NOT BETWEEN 1 AND 100
    OR v_device NOT IN ('mobile','tablet','desktop') OR v_device IS NULL THEN
   RAISE EXCEPTION 'نوع حدث غير صالح' USING ERRCODE='22023';
  END IF;
  v_ms:=CASE WHEN v_event->>'ms' IS NULL THEN NULL ELSE (v_event->>'ms')::integer END;
  IF v_ms IS NOT NULL AND v_ms NOT BETWEEN 0 AND 120000 THEN
   RAISE EXCEPTION 'مدة غير صالحة' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_activity_events(event_id,actor_uid,session_id,kind,view_key,action_key,duration_ms,succeeded,device_kind)
   VALUES ((v_event->>'id')::uuid,v_actor,(v_event->>'session')::uuid,v_kind,v_view,v_action,
    v_ms,CASE WHEN v_event->>'ok' IS NULL THEN NULL ELSE (v_event->>'ok')::boolean END,v_device)
  ON CONFLICT (event_id) DO NOTHING;
  IF FOUND THEN v_inserted:=v_inserted+1; END IF;
 END LOOP;
 RETURN v_inserted;
END;
$function$
;
REVOKE ALL ON FUNCTION public.record_platform_activity_batch(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_platform_activity_batch(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_platform_activity_events(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_platform_activity_events(integer) TO authenticated;
