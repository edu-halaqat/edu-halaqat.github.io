-- Sanabil Al-Wahy: reset operational data while preserving the admin login,
-- organization, admin profile/membership, schema, RLS policies, and Quran reference data.
begin;

delete from public.audit_logs;
delete from public.device_approvals;
delete from public.exam_questions;
delete from public.tests;
delete from public.exam_schedules;
delete from public.exam_requests;
delete from public.outcomes;
delete from public.attendance;
delete from public.plan_days;
delete from public.plans;
delete from public.programs;
delete from private.student_identity_data;
delete from public.students;
delete from public.teachers;
delete from public.examiners;
delete from public.question_bank;
delete from public.public_profiles;
delete from public.settings;
delete from public.circles;
delete from public.mosques;
delete from public.complexes;

commit;

-- Verification: every returned count should be zero.
select 'students' as table_name, count(*) as remaining from public.students
union all select 'teachers', count(*) from public.teachers
union all select 'examiners', count(*) from public.examiners
union all select 'attendance', count(*) from public.attendance
union all select 'outcomes', count(*) from public.outcomes
union all select 'plans', count(*) from public.plans
union all select 'tests', count(*) from public.tests
union all select 'exam_requests', count(*) from public.exam_requests
union all select 'circles', count(*) from public.circles
union all select 'mosques', count(*) from public.mosques
union all select 'complexes', count(*) from public.complexes;

