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
 LEFT JOIN LATERAL (SELECT m2.role FROM public.memberships m2 WHERE m2.user_id=e.actor_uid AND m2.active=true ORDER BY m2.created_at DESC LIMIT 1) m ON true
 ORDER BY e.created_at DESC LIMIT greatest(1,least(coalesce(p_limit,150),500));
END;
$function$
;
