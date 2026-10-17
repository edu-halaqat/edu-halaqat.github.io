-- Applied through Supabase migration optimize_active_student_plan_lookup.
create index if not exists plans_active_student_type_updated_idx on public.plans(student_id,type,updated_at desc) where status='active';
