-- Prevent false student FK violations for teachers officially assigned to multiple circles.
-- Scope FK stays enforced (teacher ID + org + complex); circle assignment is
-- checked by a private trigger, retaining legacy primary-circle semantics.
-- This file is designed to be applied in a single transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION private.validate_student_teacher_circle_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $fn$
BEGIN
  IF NEW.teacher_id IS NULL THEN RETURN NEW; END IF;

  -- Editing an existing student's name/phone/outcomes must not become blocked
  -- if the supervisor later changes a historical assignment.
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.teacher_id, NEW.org_id, NEW.complex_id, NEW.circle_id)
       IS NOT DISTINCT FROM
       ROW(OLD.teacher_id, OLD.org_id, OLD.complex_id, OLD.circle_id) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = NEW.teacher_id
      AND t.org_id = NEW.org_id
      AND t.complex_id = NEW.complex_id
      AND (
        -- The teacher's existing primary circle remains valid, as previously.
        t.circle_id = NEW.circle_id
        OR (
          -- Additional circles require an active official assignment.
          t.active IS TRUE
          AND t.user_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.circle_teachers ct
            WHERE ct.teacher_id = t.id
              AND ct.org_id = NEW.org_id
              AND ct.complex_id = NEW.complex_id
              AND ct.circle_id = NEW.circle_id
              AND ct.active IS TRUE
          )
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'المعلم المختار غير مسند رسميًا إلى هذه الحلقة في المجمع؛ تحقق من إسناد المعلمين.';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.validate_student_teacher_circle_assignment() FROM PUBLIC, anon, authenticated;

-- Existing composite UNIQUE (id, org_id, complex_id) already exists on teachers.
-- Changing the 4-column FK is essential to supporting official multi-circle links.
ALTER TABLE public.students
  DROP CONSTRAINT students_teacher_id_org_id_complex_id_circle_id_fkey;

ALTER TABLE public.students
  ADD CONSTRAINT students_teacher_id_org_id_complex_id_fkey
  FOREIGN KEY (teacher_id, org_id, complex_id)
  REFERENCES public.teachers(id, org_id, complex_id)
  NOT VALID;

ALTER TABLE public.students
  VALIDATE CONSTRAINT students_teacher_id_org_id_complex_id_fkey;

DROP TRIGGER IF EXISTS students_validate_teacher_circle_assignment ON public.students;
CREATE TRIGGER students_validate_teacher_circle_assignment
BEFORE INSERT OR UPDATE OF teacher_id, org_id, complex_id, circle_id
ON public.students
FOR EACH ROW
EXECUTE FUNCTION private.validate_student_teacher_circle_assignment();

COMMIT;
