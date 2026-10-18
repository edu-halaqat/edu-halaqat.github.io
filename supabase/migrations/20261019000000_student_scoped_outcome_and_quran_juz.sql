-- Scope readback to one authorized student and derive authoritative juz boundaries from QuranDB.
CREATE OR REPLACE FUNCTION public.get_student_daily_assignment_guarded(p_student_id text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.circles%rowtype;
  out jsonb;
begin
  select * into c from public.circles where id=(select s.circle_id from public.students s where s.id=p_student_id and s.active) and active;
  if not found then raise exception 'الحلقة غير موجودة أو غير نشطة.'; end if;
  if not private.can_access(c.org_id,c.complex_id,c.id,array['admin','manager','supervisor','teacher']::public.app_role[]) then
    raise exception 'لا تملك صلاحية عرض هذه الحلقة.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId',s.id,'fullName',s.full_name,'teacherId',s.teacher_id,'guardianPhone',s.guardian_phone,
    'memorization',case when md.id is null then null else jsonb_build_object(
      'planId',mp.id,'planName',coalesce(mp.name,'الحفظ الجديد'),'dayId',md.id,
      'from',coalesce(md.carry_from,md.target_from),'to',md.target_to,'plannedFrom',md.target_from,
      'amount',coalesce(md.target_amount,0)+coalesce(md.carry_in,0),'carryIn',md.carry_in,
      'unit',mp.unit,'direction',mp.direction,'cycleNo',md.cycle_no,'segments',md.segments,'displayLabel',md.display_label
    ) end,
    'recentReview',case when sd.id is null then null else jsonb_build_object(
      'planId',sp.id,'planName',coalesce(sp.name,'المراجعة الصغرى'),'dayId',sd.id,
      'from',coalesce(sd.carry_from,sd.target_from),'to',sd.target_to,'plannedFrom',sd.target_from,
      'amount',coalesce(sd.target_amount,0)+coalesce(sd.carry_in,0),'carryIn',sd.carry_in,
      'unit',sp.unit,'direction',sp.direction,'cycleNo',sd.cycle_no,'segments',sd.segments,'displayLabel',sd.display_label
    ) end,
    'reviews',coalesce(rv.items,'[]'::jsonb),
    'review',case when jsonb_array_length(coalesce(rv.items,'[]'::jsonb))=0 then null else (rv.items->0) end,
    'memorizationRating',coalesce(md.rating,o.memorization_rating),
    'recentReviewRating',coalesce(sd.rating,o.recent_review_rating),
    'reviewRating',o.review_rating,
    'notes',o.notes,'recitationMetrics',o.recitation_metrics,
    'outcomeSavedAt',o.updated_at,
    'attendanceStatus',sa.status,'attendanceNote',sa.note
  ) order by s.full_name),'[]'::jsonb)
  into out
  from public.students s
  left join lateral (
    select p.* from public.plans p
    where p.student_id=s.id and p.status='active' and p.type='memorization'
      and p.start_date<=p_date and p.end_date>=p_date
    order by p.updated_at desc limit 1
  ) mp on true
  left join public.plan_days md on md.plan_id=mp.id and md.date_key=p_date
  left join lateral (
    select p.* from public.plans p
    where p.student_id=s.id and p.status='active' and p.type='recent_review'
      and p.start_date<=p_date and p.end_date>=p_date
    order by p.updated_at desc limit 1
  ) sp on true
  left join public.plan_days sd on sd.plan_id=sp.id and sd.date_key=p_date
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'planId',p.id,'planName',coalesce(nullif(p.name,''),'المراجعة الكبرى'),'dayId',pd.id,
      'from',coalesce(pd.carry_from,pd.target_from),'to',pd.target_to,'plannedFrom',pd.target_from,
      'amount',coalesce(pd.target_amount,0)+coalesce(pd.carry_in,0),'carryIn',pd.carry_in,
      'unit',p.unit,'direction',p.direction,'cycleNo',pd.cycle_no,'rating',pd.rating,'segments',pd.segments,
      'displayLabel',pd.display_label
    ) order by p.created_at,p.id) items
    from public.plans p
    join public.plan_days pd on pd.plan_id=p.id and pd.date_key=p_date
    where p.student_id=s.id and p.status='active' and p.type='review'
      and p.start_date<=p_date and p.end_date>=p_date
  ) rv on true
  left join public.outcomes o on o.student_id=s.id and o.date_key=p_date
  left join public.student_attendance sa on sa.student_id=s.id and sa.date_key=p_date
  where s.id=p_student_id and s.circle_id=c.id and s.active;

  return out->0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.quran_juz_boundaries()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'juzNo',j.juz_no,'fromSurahNo',first_ayah.surah_no,'fromAyahNo',first_ayah.ayah_no,
  'toSurahNo',last_ayah.surah_no,'toAyahNo',last_ayah.ayah_no
) ORDER BY j.juz_no),'[]'::jsonb)
FROM (SELECT DISTINCT juz_no FROM public.quran_ayahs WHERE juz_no BETWEEN 1 AND 30) j
CROSS JOIN LATERAL (
 SELECT surah_no,ayah_no FROM public.quran_ayahs
 WHERE juz_no=j.juz_no ORDER BY ayah_index ASC LIMIT 1
) first_ayah
CROSS JOIN LATERAL (
 SELECT surah_no,ayah_no FROM public.quran_ayahs
 WHERE juz_no=j.juz_no ORDER BY ayah_index DESC LIMIT 1
) last_ayah
$function$;
REVOKE ALL ON FUNCTION public.get_student_daily_assignment_guarded(text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_daily_assignment_guarded(text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.quran_juz_boundaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quran_juz_boundaries() TO authenticated;
