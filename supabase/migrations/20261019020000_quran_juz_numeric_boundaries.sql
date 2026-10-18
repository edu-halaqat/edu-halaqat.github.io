CREATE OR REPLACE FUNCTION public.quran_juz_boundaries()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'juzNo',j.juz_no,'fromSurahNo',first_ayah.surah_no,'fromAyahNo',first_ayah.ayah_no,'fromAyahIndex',first_ayah.ayah_index,
  'toSurahNo',last_ayah.surah_no,'toAyahNo',last_ayah.ayah_no,'toAyahIndex',last_ayah.ayah_index
) ORDER BY j.juz_no),'[]'::jsonb)
FROM (SELECT DISTINCT juz_no FROM public.quran_ayahs WHERE juz_no BETWEEN 1 AND 30) j
CROSS JOIN LATERAL (
 SELECT surah_no,ayah_no,ayah_index FROM public.quran_ayahs
 WHERE juz_no=j.juz_no ORDER BY ayah_index ASC LIMIT 1
) first_ayah
CROSS JOIN LATERAL (
 SELECT surah_no,ayah_no,ayah_index FROM public.quran_ayahs
 WHERE juz_no=j.juz_no ORDER BY ayah_index DESC LIMIT 1
) last_ayah
$function$;
REVOKE ALL ON FUNCTION public.quran_juz_boundaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quran_juz_boundaries() TO authenticated;