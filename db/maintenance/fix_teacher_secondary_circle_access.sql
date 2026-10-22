-- Fix the mismatch between teacher membership's legacy primary circle and
-- formally approved active links in public.circle_teachers.
--
-- Prior: private.can_access() accepted teacher membership for one circle only.
-- Other private guards (current_teacher_id_for_circle) already accept active
-- secondary-circle links. This update makes read access consistent while
-- preserving active memberships, org/complex limits and exact teacher links.
--
-- This updates existing SECURITY DEFINER function; no new public RPC grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20000ms';

CREATE OR REPLACE FUNCTION private.can_access(
  p_org_id text,
  p_complex_id text,
  p_circle_id text,
  p_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.memberships m ON m.user_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.active
      AND m.active
      AND m.role = ANY(p_roles)
      AND (
        m.role = 'admin'
        OR (
          m.org_id = p_org_id
          AND (p_complex_id IS NULL OR m.complex_id IS NULL OR m.complex_id = p_complex_id)
          AND (
            p_circle_id IS NULL
            OR m.circle_id IS NULL
            OR m.circle_id = p_circle_id
            OR (
              -- Only teachers, and only when callers permit the teacher role,
              -- may use formally approved additional circle assignments.
              m.role = 'teacher'
              AND p_circle_id IS NOT NULL
              AND p_complex_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.teachers t
                WHERE t.user_id = p.id
                  AND t.active
                  AND t.org_id = p_org_id
                  AND t.complex_id = p_complex_id
                  AND private.teacher_assigned_to_circle(
                    t.id, p_org_id, p_complex_id, p_circle_id
                  )
              )
            )
          )
        )
      )
  );
$function$;

COMMIT;
