-- Remove only the unused shadow point calculator introduced during development.
-- The published score engine in complex_score_policies/snabil_score_day_rows
-- derives points from confirmed attendance and outcomes and remains untouched.
-- No student attendance, grade, outcome, plan or existing policy is deleted.
drop trigger if exists student_points_from_attendance on public.student_attendance;
drop trigger if exists student_points_from_outcomes on public.outcomes;
drop trigger if exists student_points_from_plan_grade on public.plan_days;
drop function if exists public.update_student_points_on_change();
drop function if exists public.guardian_student_points_report(text,date,date);
drop function if exists public.recompute_student_daily_points(text,date);
drop function if exists public.get_student_scoring_policy(text);
drop function if exists public.set_student_scoring_policy(text,jsonb,date);
drop function if exists public.set_student_scoring_period(text,text,text,date,date);
drop function if exists public.student_scoring_rules_for(text,date);
drop function if exists public.student_scoring_defaults();
drop function if exists public.student_rating_points(text,text);
drop table if exists public.student_daily_points;
drop table if exists public.student_scoring_periods;
drop table if exists public.student_scoring_policies;
