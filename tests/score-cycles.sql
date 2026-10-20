-- Transactional integration test: all fixtures are rolled back.
begin;
do $$
declare u uuid; cx text; r jsonb; c jsonb; old_id bigint; future_id bigint; n int; actual int; expected int; student text;
 today date:=(now() at time zone 'Asia/Riyadh')::date; blocked boolean;
begin
 select m.user_id into u from public.memberships m join public.profiles p on p.id=m.user_id where m.active and p.active and m.role='admin' limit 1;
 if u is null then raise exception 'Admin fixture unavailable';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 r:=public.snabil_honor_roll_cycle(null,null);cx:=r->>'complexId';
 if (r->>'to')::date>today then raise exception 'future counting window';end if;
 -- Isolated test fixture within rollback; no production rows removed.
 delete from private.snabil_score_cycle_schedule where complex_id=cx;
 delete from private.snabil_score_cycles where complex_id=cx;
 c:=public.snabil_create_score_cycle(cx,'اختبار دورة سابقة',today-6,today-4,today-3,2);old_id:=(c->>'id')::bigint;
 r:=public.snabil_honor_roll_cycle(cx,null);
 if (r#>>'{cycle,from}')::date<>today-1 or (r->>'to')::date<>today then raise exception 'rollover boundary failure';end if;
 if (r#>>'{cycle,schedule,nextStart}')::date<>today+1 then raise exception 'next reset failure';end if;
 select count(*) into n from private.snabil_score_cycles where complex_id=cx;
 if n<>3 then raise exception 'expected 3 cycles, got %',n;end if;
 perform public.snabil_honor_roll_cycle(cx,null);
 if (select count(*) from private.snabil_score_cycles where complex_id=cx)<>n then raise exception 'duplicate rollover';end if;
 r:=public.snabil_honor_roll_cycle(cx,old_id);
 if (r->>'from')::date<>today-6 or (r->>'to')::date<>today-4 then raise exception 'archive window failure';end if;
 student:=r#>>'{rows,0,id}';actual:=(r#>>'{rows,0,points}')::int;
 if student is not null then
 select coalesce(sum(total_points),0)::int into expected from public.snabil_score_day_rows(cx,today-6,today-4) where student_id=student;
 if actual<>expected then raise exception 'cycle points mismatch';end if;
 end if;
 blocked:=false;begin perform public.snabil_create_score_cycle(cx,'تداخل',today,today+1,null,null);exception when others then blocked:=true;end;
 if not blocked then raise exception 'overlap accepted';end if;
 perform public.snabil_set_score_cycle_schedule(cx,today+2,7);
 c:=private.snabil_score_cycle_context(cx,null);
 if (c#>>'{schedule,duration}')::int<>7 then raise exception 'schedule update failure';end if;
 perform public.snabil_set_score_cycle_schedule(cx,null,null);
 c:=public.snabil_create_score_cycle(cx,'دورة مستقبلية',today+5,today+6,null,null);future_id:=(c->>'id')::bigint;
 r:=public.snabil_honor_roll_cycle(cx,future_id);
 if r->>'to' is not null or r#>>'{cycle,status}'<>'scheduled' or exists(select 1 from jsonb_array_elements(r->'rows') v where (v->>'points')::int<>0) then raise exception 'future cycle scored';end if;
 r:=public.snabil_honor_roll_cycle(cx,null);
 if (r->>'from')::date>today then raise exception 'future default cycle';end if;
 if student is not null then
 perform set_config('request.jwt.claim.role','service_role',true);
 c:=public.snabil_guardian_score_cycle(student);
 if c#>>'{cycle,id}' is distinct from r#>>'{cycle,id}' then raise exception 'guardian cycle mismatch';end if;
 end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 select m.user_id into u from public.memberships m join public.profiles p on p.id=m.user_id where m.active and p.active and m.role='teacher'
 and not exists(select 1 from public.memberships x where x.user_id=m.user_id and x.active and x.role in ('admin','manager','supervisor')) limit 1;
 if u is not null then
 perform set_config('request.jwt.claim.sub',u::text,true);
 blocked:=false;begin perform public.snabil_create_score_cycle(cx,'غير مصرح',today+10,today+11,null,null);exception when others then blocked:=true;end;
 if not blocked then raise exception 'teacher created cycle';end if;
 blocked:=false;begin perform public.snabil_set_score_cycle_schedule(cx,today+15,7);exception when others then blocked:=true;end;
 if not blocked then raise exception 'teacher changed schedule';end if;
 end if;
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;begin perform public.snabil_honor_roll_cycle(cx,null);exception when others then blocked:=true;end;
 if not blocked then raise exception 'anonymous accessed roll';end if;
 if has_function_privilege('anon','public.snabil_honor_roll_cycle(text,bigint)','execute') or has_function_privilege('authenticated','public.snabil_guardian_score_cycle(text)','execute') then raise exception 'RPC grants failure';end if;
end $$;
rollback;
