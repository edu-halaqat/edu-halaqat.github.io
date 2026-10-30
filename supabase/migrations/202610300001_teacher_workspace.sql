create table public.complex_teacher_views (
 complex_id text primary key references public.complexes(id) on delete cascade,
 mode text not null default 'both' check(mode in ('both','general','fast'))
);
alter table public.complex_teacher_views enable row level security;
revoke all on public.complex_teacher_views from public,anon,authenticated;
grant select,insert,update on public.complex_teacher_views to authenticated;
create policy teacher_views_read on public.complex_teacher_views for select to authenticated
using (exists(select 1 from public.complexes c where c.id=complex_id));
create policy teacher_views_insert on public.complex_teacher_views for insert to authenticated
with check (exists(select 1 from public.complexes c where c.id=complex_id and private.can_access(c.org_id,c.id,null,array['admin']::public.app_role[])));
create policy teacher_views_update on public.complex_teacher_views for update to authenticated
using (exists(select 1 from public.complexes c where c.id=complex_id and private.can_access(c.org_id,c.id,null,array['admin']::public.app_role[])))
with check (exists(select 1 from public.complexes c where c.id=complex_id and private.can_access(c.org_id,c.id,null,array['admin']::public.app_role[])));
-- Correct the composite-record selection without changing delegated scope.
do $patch$
declare def text;
begin
 select pg_get_functiondef('public.deactivate_teacher_student_guarded(text)'::regprocedure) into def;
 if position('SELECT * INTO teacher' in def)=0 then raise exception 'unexpected function body'; end if;
 execute replace(def,'SELECT * INTO teacher','SELECT t.* INTO teacher');
end;$patch$;

