alter function private.student_matches_scope(text,text,text,text) security invoker;
alter function private.plan_day_matches_parent(text,text,text,text,text,text) security invoker;
grant execute on function private.student_matches_scope(text,text,text,text) to authenticated;
grant execute on function private.plan_day_matches_parent(text,text,text,text,text,text) to authenticated;
