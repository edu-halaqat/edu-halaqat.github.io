-- 2026-10-22. Production-tested repair for teachers assigned to multiple circles.
-- Root cause: circle_teachers permits secondary circle assignment, but legacy foreign
-- keys also required teachers.circle_id = record.circle_id.
-- The students table was already repaired with students_teacher_id_org_id_complex_id_fkey
-- and private.validate_student_teacher_circle_assignment; assert it is present.
--
-- This script applies the same scoped-reference rule to dependent records.
-- No rows are deleted, recategorized, or reassigned. Existing plan days remain intact.
-- The foreground app and existing RLS policies still enforce actor authorization.
BEGIN;
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '45000ms';
DO $guard$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM pg_constraint
   WHERE conrelid='public.students'::regclass
   AND conname='students_teacher_id_org_id_complex_id_fkey'
   AND convalidated
 ) THEN
  RAISE EXCEPTION 'Students multi-circle FK fix must be installed first';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION private.require_scoped_teacher_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
BEGIN
  IF TG_OP='UPDATE'
    AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
    AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id
    AND NEW.complex_id IS NOT DISTINCT FROM OLD.complex_id
    AND NEW.circle_id IS NOT DISTINCT FROM OLD.circle_id
  THEN RETURN NEW; END IF;

  IF NEW.teacher_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id=NEW.teacher_id
      AND t.org_id=NEW.org_id
      AND t.complex_id=NEW.complex_id
      AND (
        t.circle_id=NEW.circle_id
        OR (t.active AND t.user_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.circle_teachers ct
             WHERE ct.teacher_id=t.id AND ct.circle_id=NEW.circle_id
               AND ct.org_id=NEW.org_id AND ct.complex_id=NEW.complex_id
               AND ct.active
           )
        )
      )
  ) THEN
    RAISE EXCEPTION 'المعلم المختار غير مسند رسميًا إلى هذه الحلقة في المجمع؛ تحقق من إسناد المعلمين.'
      USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END
$body$;
REVOKE ALL ON FUNCTION private.require_scoped_teacher_membership() FROM PUBLIC;

DO $m$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.plans'::regclass
            AND conname='plans_teacher_id_org_id_complex_id_circle_id_fkey') THEN
  ALTER TABLE public.plans
   DROP CONSTRAINT plans_teacher_id_org_id_complex_id_circle_id_fkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.plans'::regclass
                 AND conname='plans_teacher_id_org_id_complex_id_fkey') THEN
  ALTER TABLE public.plans
   ADD CONSTRAINT plans_teacher_id_org_id_complex_id_fkey
   FOREIGN KEY (teacher_id,org_id,complex_id)
   REFERENCES public.teachers(id,org_id,complex_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.plans'::regclass
                AND tgname='trg_plans_assigned_teacher_scope') THEN
  CREATE TRIGGER trg_plans_assigned_teacher_scope
   BEFORE INSERT OR UPDATE OF teacher_id,circle_id,org_id,complex_id
   ON public.plans FOR EACH ROW
   EXECUTE FUNCTION private.require_scoped_teacher_membership();
 END IF;
END $m$;

DO $m$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.plan_days'::regclass
            AND conname='plan_days_teacher_id_org_id_complex_id_circle_id_fkey') THEN
  ALTER TABLE public.plan_days
   DROP CONSTRAINT plan_days_teacher_id_org_id_complex_id_circle_id_fkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.plan_days'::regclass
                 AND conname='plan_days_teacher_id_org_id_complex_id_fkey') THEN
  ALTER TABLE public.plan_days
   ADD CONSTRAINT plan_days_teacher_id_org_id_complex_id_fkey
   FOREIGN KEY (teacher_id,org_id,complex_id)
   REFERENCES public.teachers(id,org_id,complex_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.plan_days'::regclass
                AND tgname='trg_plan_days_assigned_teacher_scope') THEN
  CREATE TRIGGER trg_plan_days_assigned_teacher_scope
   BEFORE INSERT OR UPDATE OF teacher_id,circle_id,org_id,complex_id
   ON public.plan_days FOR EACH ROW
   EXECUTE FUNCTION private.require_scoped_teacher_membership();
 END IF;
END $m$;

DO $m$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.outcomes'::regclass
            AND conname='outcomes_teacher_id_org_id_complex_id_circle_id_fkey') THEN
  ALTER TABLE public.outcomes
   DROP CONSTRAINT outcomes_teacher_id_org_id_complex_id_circle_id_fkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.outcomes'::regclass
                 AND conname='outcomes_teacher_id_org_id_complex_id_fkey') THEN
  ALTER TABLE public.outcomes
   ADD CONSTRAINT outcomes_teacher_id_org_id_complex_id_fkey
   FOREIGN KEY (teacher_id,org_id,complex_id)
   REFERENCES public.teachers(id,org_id,complex_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.outcomes'::regclass
                AND tgname='trg_outcomes_assigned_teacher_scope') THEN
  CREATE TRIGGER trg_outcomes_assigned_teacher_scope
   BEFORE INSERT OR UPDATE OF teacher_id,circle_id,org_id,complex_id
   ON public.outcomes FOR EACH ROW
   EXECUTE FUNCTION private.require_scoped_teacher_membership();
 END IF;
END $m$;

DO $m$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.exam_requests'::regclass
            AND conname='exam_requests_teacher_id_org_id_complex_id_circle_id_fkey') THEN
  ALTER TABLE public.exam_requests
   DROP CONSTRAINT exam_requests_teacher_id_org_id_complex_id_circle_id_fkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.exam_requests'::regclass
                 AND conname='exam_requests_teacher_id_org_id_complex_id_fkey') THEN
  ALTER TABLE public.exam_requests
   ADD CONSTRAINT exam_requests_teacher_id_org_id_complex_id_fkey
   FOREIGN KEY (teacher_id,org_id,complex_id)
   REFERENCES public.teachers(id,org_id,complex_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.exam_requests'::regclass
                AND tgname='trg_exam_requests_assigned_teacher_scope') THEN
  CREATE TRIGGER trg_exam_requests_assigned_teacher_scope
   BEFORE INSERT OR UPDATE OF teacher_id,circle_id,org_id,complex_id
   ON public.exam_requests FOR EACH ROW
   EXECUTE FUNCTION private.require_scoped_teacher_membership();
 END IF;
END $m$;

DO $m$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.exam_schedules'::regclass
            AND conname='exam_schedules_teacher_id_org_id_complex_id_circle_id_fkey') THEN
  ALTER TABLE public.exam_schedules
   DROP CONSTRAINT exam_schedules_teacher_id_org_id_complex_id_circle_id_fkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.exam_schedules'::regclass
                 AND conname='exam_schedules_teacher_id_org_id_complex_id_fkey') THEN
  ALTER TABLE public.exam_schedules
   ADD CONSTRAINT exam_schedules_teacher_id_org_id_complex_id_fkey
   FOREIGN KEY (teacher_id,org_id,complex_id)
   REFERENCES public.teachers(id,org_id,complex_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.exam_schedules'::regclass
                AND tgname='trg_exam_schedules_assigned_teacher_scope') THEN
  CREATE TRIGGER trg_exam_schedules_assigned_teacher_scope
   BEFORE INSERT OR UPDATE OF teacher_id,circle_id,org_id,complex_id
   ON public.exam_schedules FOR EACH ROW
   EXECUTE FUNCTION private.require_scoped_teacher_membership();
 END IF;
END $m$;

DO $m$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.tests'::regclass
            AND conname='tests_teacher_id_org_id_complex_id_circle_id_fkey') THEN
  ALTER TABLE public.tests
   DROP CONSTRAINT tests_teacher_id_org_id_complex_id_circle_id_fkey;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.tests'::regclass
                 AND conname='tests_teacher_id_org_id_complex_id_fkey') THEN
  ALTER TABLE public.tests
   ADD CONSTRAINT tests_teacher_id_org_id_complex_id_fkey
   FOREIGN KEY (teacher_id,org_id,complex_id)
   REFERENCES public.teachers(id,org_id,complex_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.tests'::regclass
                AND tgname='trg_tests_assigned_teacher_scope') THEN
  CREATE TRIGGER trg_tests_assigned_teacher_scope
   BEFORE INSERT OR UPDATE OF teacher_id,circle_id,org_id,complex_id
   ON public.tests FOR EACH ROW
   EXECUTE FUNCTION private.require_scoped_teacher_membership();
 END IF;
END $m$;
COMMIT;

-- Validate in separate, low-traffic transactions to avoid holding all locks while
-- scanning large plan_days (~124k records on the date of this repair).
ALTER TABLE public.plans VALIDATE CONSTRAINT plans_teacher_id_org_id_complex_id_fkey;
ALTER TABLE public.plan_days VALIDATE CONSTRAINT plan_days_teacher_id_org_id_complex_id_fkey;
ALTER TABLE public.outcomes VALIDATE CONSTRAINT outcomes_teacher_id_org_id_complex_id_fkey;
ALTER TABLE public.exam_requests VALIDATE CONSTRAINT exam_requests_teacher_id_org_id_complex_id_fkey;
ALTER TABLE public.exam_schedules VALIDATE CONSTRAINT exam_schedules_teacher_id_org_id_complex_id_fkey;
ALTER TABLE public.tests VALIDATE CONSTRAINT tests_teacher_id_org_id_complex_id_fkey;

-- Expected result: 7 rows with convalidated=true.
SELECT conrelid::regclass AS table_name, conname, convalidated
FROM pg_constraint
WHERE contype='f' AND conname IN (
  'students_teacher_id_org_id_complex_id_fkey',
  'plans_teacher_id_org_id_complex_id_fkey',
  'plan_days_teacher_id_org_id_complex_id_fkey',
  'outcomes_teacher_id_org_id_complex_id_fkey',
  'exam_requests_teacher_id_org_id_complex_id_fkey',
  'exam_schedules_teacher_id_org_id_complex_id_fkey',
  'tests_teacher_id_org_id_complex_id_fkey'
) ORDER BY conrelid::regclass::text;

-- Verified separately on production (BEGIN ... ROLLBACK):
-- 3 dummy students, 6 plans, 18 daily assignments, all valid;
-- unauthorized teacher for a different circle was rejected;
-- independent clean-up verification showed no retained test rows.
