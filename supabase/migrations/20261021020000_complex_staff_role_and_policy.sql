-- Feature: supervisor-created complex administrative staff, configurable per complex.
-- This migration intentionally grants NO browser access to policy / staff directory tables.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

CREATE TABLE IF NOT EXISTS public.complex_staff_creation_policy (
  complex_id text PRIMARY KEY REFERENCES public.complexes(id) ON DELETE RESTRICT,
  org_id text NOT NULL,
  allow_supervisor_staff_creation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE IF NOT EXISTS public.complex_staff_directory (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id text NOT NULL,
  complex_id text NOT NULL REFERENCES public.complexes(id) ON DELETE RESTRICT,
  job_title text NOT NULL DEFAULT 'إداري مجمع',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complex_staff_directory_scope
  ON public.complex_staff_directory(org_id, complex_id);
ALTER TABLE public.complex_staff_creation_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complex_staff_directory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.complex_staff_creation_policy FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.complex_staff_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.complex_staff_creation_policy TO service_role;
GRANT SELECT, INSERT ON public.complex_staff_directory TO service_role;
