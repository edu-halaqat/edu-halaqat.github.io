-- Status must count verified default holidays as approved, but respect
-- explicit circle "study" overrides above the global default.
DO $patch$
DECLARE definition text;old_part text;new_part text;
BEGIN
 definition:=pg_get_functiondef('public.get_calendar_reflow_status_guarded(text[],date)'::regprocedure);
 old_part:='EXISTS(SELECT 1 FROM public.circle_day_types t WHERE t.circle_id=c.id AND t.date_key=p_date) approved,';
 new_part:='(COALESCE('||chr(10)||
  '       (SELECT t.day_type FROM public.circle_day_types t'||chr(10)||
  '        WHERE t.circle_id=c.id AND t.date_key=p_date),'||chr(10)||
  '       (SELECT h.day_type FROM private.academic_calendar_default_days h WHERE h.date_key=p_date),'||chr(10)||
  '       ''study'')<>''study'') AS approved,';
 IF position(new_part in definition)=0 THEN
   IF position(old_part in definition)=0 THEN
     RAISE EXCEPTION 'موضع احتساب حالة تقويم الحلقة تغيّر؛ أوقف التصحيح.';
   END IF;
   EXECUTE replace(definition,old_part,new_part);
 END IF;
END $patch$;