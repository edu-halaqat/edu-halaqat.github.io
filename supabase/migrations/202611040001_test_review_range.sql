create or replace function public.update_test_review_range_guarded(
 p_student_id text,p_date date,p_plan_id text,p_old_from jsonb,p_old_to jsonb,
 p_from_surah integer,p_from_ayah integer,p_to_surah integer,p_to_ayah integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.students%rowtype;
 t public.test_day_reviews%rowtype;
 f public.quran_ayahs%rowtype;
 e public.quran_ayahs%rowtype;
 first_ref jsonb;
 last_ref jsonb;
begin
 select * into s from public.students where id=p_student_id and active for share;
 if not found or auth.uid() is null or private.active_user() is not true or
   (private.can_access(s.org_id,s.complex_id,s.circle_id,array['admin','manager','supervisor']::public.app_role[])
    or private.can_teacher_edit_daily_plan(s.org_id,s.complex_id,s.circle_id)) is not true then
   raise exception 'لا تملك صلاحية تعديل مقرر هذا الطالب.' using errcode='42501';
 end if;
 perform private.assert_circle_session_allowed(s.circle_id,p_date);
 if private.effective_day_type(s.id,p_date) is distinct from 'test' then raise exception 'اليوم المحدد ليس يوم اختبار.'; end if;
 select * into strict t from public.test_day_reviews where circle_id=s.circle_id and student_id=s.id and date_key=p_date and plan_id=p_plan_id for update;
 select * into f from public.quran_ayahs where surah_no=p_from_surah and ayah_no=p_from_ayah;
 select * into e from public.quran_ayahs where surah_no=p_to_surah and ayah_no=p_to_ayah;
 if f.ayah_index is null or e.ayah_index is null or (f.surah_no=e.surah_no and f.ayah_no>e.ayah_no) then raise exception 'راجع بداية المقرر ونهايته.'; end if;
 first_ref:=private.quran_target_ref(f.ayah_index,f.page_no::integer,f.line_start::integer);
 last_ref:=private.quran_target_ref(e.ayah_index,e.page_no::integer,e.line_end::integer);
 if (t.assigned_from->>'ayahIndex',t.assigned_to->>'ayahIndex') is distinct from (first_ref->>'ayahIndex',last_ref->>'ayahIndex') then
   if (t.assigned_from,t.assigned_to) is distinct from (p_old_from,p_old_to) then raise exception 'تغيّر المقرر منذ فتحه. أعد تحميل الحصيلة.'; end if;
   update public.test_day_reviews set assigned_from=first_ref,assigned_to=last_ref,updated_at=now(),updated_by=auth.uid()
    where student_id=s.id and circle_id=s.circle_id and date_key=p_date and plan_id=p_plan_id;
   insert into public.audit_logs(org_id,action,actor_uid,entity_table,entity_id,details)
    values(s.org_id,'test.review_range_edited',auth.uid(),'test_day_reviews',p_plan_id,jsonb_build_object('date',p_date,'studentId',s.id,'oldFrom',t.assigned_from,'oldTo',t.assigned_to,'newFrom',first_ref,'newTo',last_ref));
 end if;
 return jsonb_build_object('from',first_ref,'to',last_ref);
end;
$$;
revoke all on function public.update_test_review_range_guarded(text,date,text,jsonb,jsonb,int,int,int,int) from public,anon;
grant execute on function public.update_test_review_range_guarded(text,date,text,jsonb,jsonb,int,int,int,int) to authenticated;
