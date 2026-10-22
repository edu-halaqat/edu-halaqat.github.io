-- Production hotfix for timeouts confirmed in PostgREST 57014 at 2026-10-22 00:32-00:33 UTC.
-- Only write RPCs with expensive per-student planning/rollforward are affected.
-- Keeps ordinary authenticated endpoints at the default 8-second budget.
ALTER FUNCTION public.save_plan_bundle_whole_ayah(text,text,date,smallint[],jsonb)
  SET statement_timeout TO '45s';
ALTER FUNCTION public.save_plan_bundle_auto(text,text,date,smallint[],jsonb)
  SET statement_timeout TO '45s';
ALTER FUNCTION public.save_plan_bundle(text,text,date,date,smallint[],jsonb)
  SET statement_timeout TO '45s';
ALTER FUNCTION public.apply_offline_operations_batch(jsonb)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.apply_offline_operation(uuid,text,jsonb)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.save_daily_outcomes_guarded(date,jsonb)
  SET statement_timeout TO '30s';
