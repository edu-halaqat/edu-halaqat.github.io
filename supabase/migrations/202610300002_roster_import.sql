do $patch$
declare def text;
begin
 select pg_get_functiondef('public.import_teacher_students_guarded(text,jsonb)'::regprocedure) into def;
 def:=replace(def,'SELECT name FROM public.complexes WHERE id=c.complex_id','SELECT cx.name FROM public.complexes cx WHERE cx.id=c.complex_id');
 def:=replace(def,E'regexp_split_to_array(name,\'\\\\s+\')',E'regexp_split_to_array(name,\'[[:space:]]+\')');
 execute def;
end;$patch$;
