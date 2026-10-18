-- Publish only approved, signed, previously staged Jadeer results.
-- Fail closed when score calculations or assignment data differ.
create or replace function public.jadeer_bridge_publish_result(p_result_id text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_box integration_jadeer.results_inbox%rowtype;
  v_match jsonb; v_payload jsonb; v_result jsonb; v_answers jsonb; v_scores jsonb;
  v_student public.students%rowtype;
  v_teacher public.teachers%rowtype;
  v_circle public.circles%rowtype;
  v_req public.exam_requests%rowtype;
  v_schedule public.exam_schedules%rowtype;
  v_student_id text; v_teacher_id text; v_circle_id text; v_complex_id text;
  v_schedule_id text; v_code text; v_type text; v_syllabus jsonb;
  v_executed timestamptz;
  v_count integer; v_mem numeric(7,2); v_taj numeric(7,2);
  v_actual_mem numeric(7,2); v_actual_taj numeric(7,2); v_actual_total numeric(7,2);
begin
  if nullif(btrim(p_result_id),'') is null then
    return jsonb_build_object('ok',false,'code','invalid_result_id');
  end if;
  select * into v_box from integration_jadeer.results_inbox
  where jadeer_result_id=p_result_id for update;
  if not found then return jsonb_build_object('ok',false,'code','inbox_missing'); end if;
  if v_box.state='published' then
    return jsonb_build_object('ok',true,'published',true,'duplicate',true,'test_id',v_box.applied_test_id);
  end if;
  if v_box.publish_mode<>'jadeer_and_snabil' or v_box.state<>'ready' then
    return jsonb_build_object('ok',false,'code','not_ready','message',coalesce(v_box.match_issue,'هذه النتيجة غير جاهزة للنشر.'));
  end if;
  v_payload=v_box.payload; v_result=v_payload->'result'; v_answers=v_result->'answers';
  if v_payload->>'source_project'<>'quran-tests-program'
     or v_result->>'status'<>'completed'
     or v_result->'approved'<>'true'::jsonb then
    return jsonb_build_object('ok',false,'code','unapproved');
  end if;
  if jsonb_typeof(v_answers) is distinct from 'array'
     or octet_length(v_answers::text)>65536 then
    return jsonb_build_object('ok',false,'code','answers_required');
  end if;
  v_count=jsonb_array_length(v_answers);
  if v_count not between 2 and 15 then
    return jsonb_build_object('ok',false,'code','question_count_invalid');
  end if;

  -- Validate all types before casts, including existence in authoritative Mushaf.
  if exists (select 1 from jsonb_array_elements(v_answers) a
     where jsonb_typeof(a)<>'object'
        or jsonb_typeof(a->'errors') is distinct from 'number'
        or jsonb_typeof(a->'doubts') is distinct from 'number'
        or jsonb_typeof(a->'tajweed') is distinct from 'number'
        or jsonb_typeof(a->'surahNo') is distinct from 'number'
        or jsonb_typeof(a->'ayahNo') is distinct from 'number'
        or (a ? 'notes' and a->'notes'<>'null'::jsonb and jsonb_typeof(a->'notes')<>'string')
  ) then return jsonb_build_object('ok',false,'code','answer_type_invalid'); end if;
  if exists (select 1 from jsonb_array_elements(v_answers) a
      where (a->>'errors')::numeric not between 0 and 100
         or (a->>'doubts')::numeric not between 0 and 100
         or (a->>'tajweed')::numeric not between 0 and 100
         or (a->>'surahNo')::numeric not between 1 and 114
         or (a->>'ayahNo')::numeric not between 1 and 1000
         or mod((a->>'errors')::numeric,1)<>0
         or mod((a->>'doubts')::numeric,1)<>0
         or mod((a->>'tajweed')::numeric,1)<>0
         or mod((a->>'surahNo')::numeric,1)<>0
         or mod((a->>'ayahNo')::numeric,1)<>0
  ) then return jsonb_build_object('ok',false,'code','answer_number_invalid'); end if;
  if exists (select 1 from jsonb_array_elements(v_answers) a
    where not exists (select 1 from public.quran_ayahs q
    where q.surah_no=(a->>'surahNo')::integer and q.ayah_no=(a->>'ayahNo')::integer)
  ) then return jsonb_build_object('ok',false,'code','ayah_reference_invalid'); end if;

  -- Compute Snabil scores independently: never trust incoming totals.
  select round(avg(greatest(0::numeric,80 - (a->>'errors')::numeric*2 - (a->>'doubts')::numeric)),2),
         round(avg(greatest(0::numeric,20 - (a->>'tajweed')::numeric*0.25)),2)
  into v_mem,v_taj from jsonb_array_elements(v_answers) a;
  v_scores=v_result->'scores';
  if jsonb_typeof(v_scores) is distinct from 'object'
     or jsonb_typeof(v_scores->'memorization') is distinct from 'number'
     or jsonb_typeof(v_scores->'tajweed') is distinct from 'number'
     or jsonb_typeof(v_scores->'total') is distinct from 'number'
  then return jsonb_build_object('ok',false,'code','scores_invalid'); end if;
  v_actual_mem=(v_scores->>'memorization')::numeric;
  v_actual_taj=(v_scores->>'tajweed')::numeric;
  v_actual_total=(v_scores->>'total')::numeric;
  if v_actual_mem<>v_mem or v_actual_taj<>v_taj
     or v_actual_total<>round(v_mem+v_taj,2) then
    update integration_jadeer.results_inbox
      set state='pending_review',match_issue='درجات جدير لا تطابق حساب سنابل؛ تحتاج مراجعة قبل نشرها.',updated_at=now()
      where jadeer_result_id=p_result_id;
    return jsonb_build_object('ok',false,'code','score_mismatch','message','درجات جدير لا تطابق حساب سنابل؛ أُحيلت للمراجعة.');
  end if;

  v_match=integration_jadeer.resolve_target(v_payload);
  if (v_match->>'matched')::boolean is distinct from true then
    update integration_jadeer.results_inbox
      set state='unmatched',match_issue=v_match->>'message',resolved_student_id=null,updated_at=now()
      where jadeer_result_id=p_result_id;
    return jsonb_build_object('ok',false,'code',v_match->>'code','message',v_match->>'message');
  end if;
  v_student_id=v_match->>'student_id';
  v_teacher_id=v_match->>'teacher_id';
  v_circle_id=v_match->>'circle_id';
  v_complex_id=v_match->>'complex_id';

  select * into v_student from public.students where id=v_student_id and active;
  select * into v_teacher from public.teachers where id=v_teacher_id and active;
  select * into v_circle from public.circles where id=v_circle_id and active;
  if v_student.id is null or v_teacher.id is null or v_circle.id is null
     or v_student.teacher_id is distinct from v_teacher.id
     or v_student.circle_id is distinct from v_circle.id
     or v_student.complex_id is distinct from v_complex_id
     or v_teacher.circle_id is distinct from v_circle.id
     or v_teacher.complex_id is distinct from v_complex_id then
    return jsonb_build_object('ok',false,'code','assignment_changed');
  end if;

  if nullif(v_payload->>'snabil_request_id','') is not null then
    select * into v_req from public.exam_requests
       where id=v_payload->>'snabil_request_id'
         and destination='jadeer' and student_id=v_student_id
         and teacher_id=v_teacher_id and circle_id=v_circle_id and complex_id=v_complex_id;
    if not found then return jsonb_build_object('ok',false,'code','request_mismatch'); end if;
    if not exists (select 1 from integration_jadeer.outbound_requests o
       where o.snabil_request_id=v_req.id and o.state='accepted') then
      return jsonb_build_object('ok',false,'code','unconfirmed_request');
    end if;
    if v_req.question_count<>v_count then
      return jsonb_build_object('ok',false,'code','question_count_mismatch');
    end if;
  end if;

  begin
    v_executed=coalesce(nullif(v_result->>'performed_at',''),nullif(v_result->>'executed_at',''))::timestamptz;
  exception when others then
    return jsonb_build_object('ok',false,'code','invalid_exam_time');
  end;
  if v_executed is null or v_executed<='2020-01-01'::timestamptz or v_executed>now()+interval '1 day' then
    return jsonb_build_object('ok',false,'code','invalid_exam_time');
  end if;
  v_type=case when v_req.id is not null then v_req.type
     when v_result->>'type'='full' then 'full' else 'custom' end;
  v_syllabus=case when v_req.id is not null then v_req.syllabus
    when jsonb_typeof(v_result->'syllabus')='object' then v_result->'syllabus'
    else jsonb_build_object('label',left(coalesce(v_result->>'syllabus','اختبار من جدير'),220)) end;
  v_syllabus=coalesce(v_syllabus,'{}'::jsonb)||jsonb_build_object('source','jadeer','jadeerResultId',p_result_id);

  if v_req.id is not null then
    select * into v_schedule from public.exam_schedules where request_id=v_req.id for update;
    if found and (v_schedule.status='completed' or exists(select 1 from public.tests t where t.schedule_id=v_schedule.id)) then
      return jsonb_build_object('ok',false,'code','schedule_already_completed');
    end if;
  end if;
  v_schedule_id=coalesce(v_schedule.id,extensions.gen_random_uuid()::text);
  if v_schedule.id is null then
    insert into public.exam_schedules(
      id,request_id,org_id,complex_id,circle_id,student_id,teacher_id,
      student_name,teacher_name,type,syllabus,syllabus_label,scheduled_at,status
    ) values (
      v_schedule_id,v_req.id,v_student.org_id,v_complex_id,v_circle_id,v_student_id,v_teacher_id,
      v_student.full_name,v_teacher.full_name,v_type,v_syllabus,
      left(coalesce(v_syllabus->>'label','اختبار جدير'),220),v_executed,'completed'
    );
  else
    update public.exam_schedules
       set status='completed',student_name=v_student.full_name,teacher_name=v_teacher.full_name,
           syllabus=v_syllabus,updated_at=now()
    where id=v_schedule_id;
  end if;
  v_answers=(select jsonb_agg(jsonb_build_object(
       'questionNo',a.ordinality,'surahNo',(a.item->>'surahNo')::integer,
       'ayahNo',(a.item->>'ayahNo')::integer,'errors',(a.item->>'errors')::integer,
       'doubts',(a.item->>'doubts')::integer,'tajweed',(a.item->>'tajweed')::integer,
       'notes',left(coalesce(a.item->>'notes',''),1000)
     ) order by a.ordinality)
      from jsonb_array_elements(v_answers) with ordinality a(item,ordinality));
  insert into public.tests(
    id,schedule_id,org_id,complex_id,circle_id,student_id,teacher_id,examiner_id,
    student_name_snapshot,teacher_name_snapshot,circle_name_snapshot,type,syllabus_snapshot,
    answers,scores,notes,performed_at,status
  ) values (
    v_schedule_id,v_schedule_id,v_student.org_id,v_complex_id,v_circle_id,v_student_id,v_teacher_id,
    null,v_student.full_name,v_teacher.full_name,v_circle.name,v_type,v_syllabus,
    v_answers,jsonb_build_object('memorization',v_mem,'tajweed',v_taj,'total',round(v_mem+v_taj,2)),
    left('نتيجة معتمدة في منصة جدير | '||coalesce(v_result->>'notes',''),2000),v_executed,'completed'
  );
  insert into public.exam_questions(
    test_id,question_no,surah_no,ayah_no,errors,doubts,tajweed_errors,notes
  )
  select v_schedule_id,a.ordinality::integer,(a.item->>'surahNo')::integer,(a.item->>'ayahNo')::integer,
    (a.item->>'errors')::integer,(a.item->>'doubts')::integer,(a.item->>'tajweed')::integer,
    left(coalesce(a.item->>'notes',''),1000)
  from jsonb_array_elements(v_answers) with ordinality a(item,ordinality);

  loop
    v_code=upper(encode(extensions.gen_random_bytes(8),'hex'));
    begin
      insert into public.public_profiles(public_code,student_display_name,result_summary,issued_at,expires_at)
      values(v_code,v_student.full_name,jsonb_build_object(
        'type',v_type,'score',round(v_mem+v_taj,2),'memorization',v_mem,'tajweed',v_taj,
        'performedAt',v_executed,'source','jadeer'),now(),now()+interval '180 days');
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  update public.tests set public_code=v_code where id=v_schedule_id;
  update public.exam_schedules
    set status='completed',scores=jsonb_build_object('memorization',v_mem,'tajweed',v_taj,'total',round(v_mem+v_taj,2)),
       result_test_id=v_schedule_id,completed_at=v_executed,updated_at=now() where id=v_schedule_id;
  update integration_jadeer.results_inbox
    set state='published',resolved_student_id=v_student_id,applied_test_id=v_schedule_id,
      match_issue=null,updated_at=now() where jadeer_result_id=p_result_id;
  if v_req.id is not null then
    update public.exam_requests set status='scheduled',updated_at=now()
       where id=v_req.id and status in ('pending','approved');
  end if;
  return jsonb_build_object('ok',true,'published',true,'duplicate',false,'test_id',v_schedule_id,'public_code',v_code);
end $$;
revoke execute on function public.jadeer_bridge_publish_result(text) from public, anon, authenticated;
grant execute on function public.jadeer_bridge_publish_result(text) to service_role;
