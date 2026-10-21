-- Private enrollment and observable refill results; no app roles receive access.
BEGIN;
CREATE TABLE IF NOT EXISTS private.plan_horizon_targets(
 student_id text PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
 horizon_days integer NOT NULL CHECK(horizon_days BETWEEN 90 AND 365),
 trigger_days integer NOT NULL CHECK(trigger_days BETWEEN 15 AND horizon_days-15),
 enabled boolean NOT NULL DEFAULT true,
 next_check_at timestamptz NOT NULL DEFAULT now(),
 last_checked_at timestamptz,
 last_result jsonb
);
ALTER TABLE private.plan_horizon_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.plan_horizon_targets FROM PUBLIC,anon,authenticated;
COMMIT;
