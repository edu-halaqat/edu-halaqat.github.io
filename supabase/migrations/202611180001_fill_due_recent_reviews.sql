-- Maintain rolling reviews for active, explicitly linked memorization plans.
CREATE OR REPLACE FUNCTION private.fill_due_recent_reviews()
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  item record;
  win record;
  inserted integer := 0;
BEGIN
  FOR item IN
    SELECT r.*, m.end_date AS mem_end, today + offsets.n AS due_date
    FROM public.plans r
    JOIN public.plans m ON m.id=r.linked_plan_id AND m.student_id=r.student_id
      AND m.type='memorization' AND m.status='active'
    CROSS JOIN generate_series(0,1) offsets(n)
    WHERE r.type='recent_review' AND r.status='active'
      AND today+offsets.n BETWEEN greatest(r.start_date,m.start_date) AND m.end_date
      AND NOT EXISTS (SELECT 1 FROM public.plan_days d WHERE d.plan_id=r.id AND d.date_key=today+offsets.n)
      AND NOT (today+offsets.n=ANY(coalesce(r.excluded_dates,'{}'::date[])))
      AND NOT (extract(dow FROM today+offsets.n)::smallint=ANY(coalesce(r.excluded_weekdays,'{}'::smallint[])))
      AND private.effective_day_type(r.student_id,today+offsets.n) IN ('study','test')
      AND EXISTS (SELECT 1 FROM public.plan_days d WHERE d.plan_id=m.id AND d.date_key<=today+offsets.n AND d.target_to IS NOT NULL)
    ORDER BY r.id,offsets.n FOR UPDATE OF r,m
  LOOP
    SELECT * INTO win FROM private.memorized_recent_window(item.student_id,item.due_date,item.unit,item.daily_amount);
    IF win.start_index IS NULL OR win.end_index IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.plan_days(plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
      target_from,target_to,target_amount,status,cycle_no,segments)
    SELECT item.id,item.org_id,item.complex_id,item.circle_id,item.student_id,item.teacher_id,item.due_date,
      private.quran_target_ref(a.ayah_index,a.page_no::integer,NULL),
      private.quran_target_ref(b.ayah_index,b.page_no::integer,NULL),win.actual_amount,'planned',1,win.segments
    FROM public.quran_ayahs a,public.quran_ayahs b WHERE a.ayah_index=win.start_index AND b.ayah_index=win.end_index
    ON CONFLICT(plan_id,date_key) DO NOTHING;
    IF FOUND THEN
      inserted := inserted+1;
      UPDATE public.plans SET end_date=item.mem_end,updated_at=now()
      WHERE id=item.id AND end_date<item.due_date;
    END IF;
  END LOOP;
  RETURN inserted;
END;
$$;
REVOKE ALL ON FUNCTION private.fill_due_recent_reviews() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('sanabil-due-recent-reviews','10 21 * * *',
  $$SET statement_timeout='45s'; SET lock_timeout='2s'; SELECT private.fill_due_recent_reviews();$$);
