do $patch$ declare def text; begin
 select pg_get_functiondef('public.deactivate_teacher_student_guarded(text)'::regprocedure) into def;
 execute replace(def,'ct public.circle_teachers%rowtype;','');
end;$patch$;
