-- Isolated synthetic fixture only. Never run this file against production.
CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;
CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS $$SELECT gen_random_uuid()$$;
CREATE TYPE public.plan_unit AS ENUM('lines','pages','ayahs','surahs','juzs','hizbs','half_hizbs','quarter_hizbs','juz','hizb','half_hizb','quarter_hizb');
CREATE TYPE public.plan_direction AS ENUM('toward_fatiha','toward_nas');
SET check_function_bodies=false;
CREATE TABLE public.plans("id" text DEFAULT (extensions.gen_random_uuid())::text NOT NULL,"org_id" text NOT NULL,"complex_id" text NOT NULL,"circle_id" text NOT NULL,"student_id" text NOT NULL,"teacher_id" text,"program_id" text,"type" text NOT NULL,"unit" plan_unit NOT NULL,"daily_amount" integer NOT NULL,"direction" plan_direction NOT NULL,"start_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,"start_date" date NOT NULL,"end_date" date NOT NULL,"excluded_weekdays" smallint[] DEFAULT ARRAY[(5)::smallint, (6)::smallint] NOT NULL,"status" text DEFAULT 'draft'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"created_by" uuid,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_by" uuid,"excluded_dates" date[] DEFAULT '{}'::date[] NOT NULL,"name" text,"cycle_enabled" boolean DEFAULT false NOT NULL,"range_end_surah" smallint,"linked_plan_id" text,"range_end_rub" smallint,"projected_completion_date" date,"projected_teaching_days" integer,"projected_total_units" integer,"materialized_through" date,"methodology_code" text,"methodology_level" text,"methodology_profile" text,"methodology_meta" jsonb DEFAULT '{}'::jsonb NOT NULL);
CREATE TABLE public.plan_days("id" text DEFAULT (extensions.gen_random_uuid())::text NOT NULL,"plan_id" text NOT NULL,"org_id" text NOT NULL,"complex_id" text NOT NULL,"circle_id" text NOT NULL,"student_id" text NOT NULL,"teacher_id" text,"date_key" date NOT NULL,"target_from" jsonb,"target_to" jsonb,"target_amount" numeric(8,2),"completed_amount" numeric(8,2) DEFAULT 0 NOT NULL,"carry_in" numeric(8,2) DEFAULT 0 NOT NULL,"carry_out" numeric(8,2) DEFAULT 0 NOT NULL,"rating" text,"notes" text,"status" text DEFAULT 'planned'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"created_by" uuid,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_by" uuid,"carry_from" jsonb,"cycle_no" integer DEFAULT 1 NOT NULL,"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,"display_label" text);
CREATE TABLE public.quran_ayahs("surah_no" smallint NOT NULL,"ayah_no" smallint NOT NULL,"name_ar" text NOT NULL,"page_no" smallint,"juz_no" smallint,"line_start" smallint,"line_end" smallint,"ayah_index" integer);
CREATE TABLE public.quran_divisions("rub_no" smallint NOT NULL,"hizb_no" smallint NOT NULL,"juz_no" smallint NOT NULL,"quarter_in_hizb" smallint NOT NULL,"from_surah" smallint NOT NULL,"from_ayah" smallint NOT NULL,"from_page" smallint NOT NULL,"to_surah" smallint NOT NULL,"to_ayah" smallint NOT NULL,"to_page" smallint NOT NULL,"from_index" integer NOT NULL,"to_index" integer NOT NULL,"source" text DEFAULT 'Quran Foundation Madani/QPC Hafs metadata'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);

ALTER TABLE plans ADD PRIMARY KEY(id); ALTER TABLE plan_days ADD PRIMARY KEY(id);
CREATE UNIQUE INDEX ON plan_days(plan_id,date_key); CREATE INDEX ON plan_days(student_id,date_key);
CREATE UNIQUE INDEX ON quran_ayahs(ayah_index); CREATE UNIQUE INDEX ON quran_ayahs(surah_no,ayah_no);
CREATE TABLE private.plan_methodologies(code text,config jsonb,active boolean,configured boolean,updated_at timestamptz);
CREATE TABLE public.outcomes(student_id text,date_key date);
CREATE TABLE public.student_attendance(student_id text,date_key date);
-- Deliberately synthetic coordinates, not a Quran reference or real student data.
INSERT INTO quran_ayahs(surah_no,ayah_no,name_ar,page_no,juz_no,line_start,line_end,ayah_index)
SELECT (i-1)/55+1,(i-1)%55+1,'fixture', (i-1)/8+1,least(30,(i-1)/208+1),(i-1)%8+1,(i-1)%8+1,i FROM generate_series(1,6236) i;
INSERT INTO quran_divisions(rub_no,hizb_no,juz_no,quarter_in_hizb,from_surah,from_ayah,from_page,to_surah,to_ayah,to_page,from_index,to_index)
SELECT i,(i-1)/4+1,(i-1)/8+1,(i-1)%4+1,a.surah_no,a.ayah_no,a.page_no,b.surah_no,b.ayah_no,b.page_no,a.ayah_index,b.ayah_index
FROM generate_series(1,240) i JOIN quran_ayahs a ON a.ayah_index=(i-1)*26+1 JOIN quran_ayahs b ON b.ayah_index=least(6236,i*26);
INSERT INTO private.plan_methodologies VALUES('bir_alwalidayn','{"levels":[{"id":"1","fromSurahNo":114,"toSurahNo":1,"targetPattern":[3,4]}]}',true,true,now());
CREATE OR REPLACE FUNCTION private.populate_plan_day_display_label()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.plans%rowtype;
  v_effective text;
  v_original text;
begin
  select * into p from public.plans where id=new.plan_id;
  if not found then return new; end if;

  v_original:=private.quran_compact_assignment_label(p.unit,p.direction,new.target_from,new.target_to);
  if coalesce(new.carry_in,0)>0 and new.carry_from is not null then
    v_effective:=private.quran_compact_assignment_label(p.unit,p.direction,new.carry_from,new.target_to);
    new.display_label:='مرحّل: '||coalesce(v_effective,v_original)||'؛ المقرر الأصلي: '||coalesce(v_original,'');
  else
    new.display_label:=v_original;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_compact_assignment_label(p_unit plan_unit, p_direction plan_direction, p_from jsonb, p_to jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from_idx integer;
  v_to_idx integer;
  v_from_group integer;
  v_to_group integer;
  v_from_label text;
  v_to_label text;
  v_from_group_start integer;
  v_to_group_end integer;
  f_surah integer;
  t_surah integer;
  f_ayah integer;
  t_ayah integer;
  f_name text;
  t_name text;
  f_max integer;
  t_max integer;
begin
  if p_from is null or p_to is null then return null; end if;

  f_surah:=coalesce(nullif(p_from->>'surahNo','')::integer,nullif(p_from->>'surah','')::integer);
  t_surah:=coalesce(nullif(p_to->>'surahNo','')::integer,nullif(p_to->>'surah','')::integer);
  f_ayah:=coalesce(nullif(p_from->>'ayahNo','')::integer,nullif(p_from->>'ayah','')::integer);
  t_ayah:=coalesce(nullif(p_to->>'ayahNo','')::integer,nullif(p_to->>'ayah','')::integer);
  v_from_idx:=nullif(p_from->>'ayahIndex','')::integer;
  v_to_idx:=nullif(p_to->>'ayahIndex','')::integer;

  if v_from_idx is null and f_surah is not null and f_ayah is not null then
    select q.ayah_index into v_from_idx
    from public.quran_ayahs q where q.surah_no=f_surah and q.ayah_no=f_ayah;
  end if;
  if v_to_idx is null and t_surah is not null and t_ayah is not null then
    select q.ayah_index into v_to_idx
    from public.quran_ayahs q where q.surah_no=t_surah and q.ayah_no=t_ayah;
  end if;

  if p_unit::text in('quarter_hizb','half_hizb','hizb','juz') then
    select case p_unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no end
      into v_from_group
    from public.quran_divisions d
    where v_from_idx between d.from_index and d.to_index
    order by d.rub_no limit 1;

    select case p_unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no end
      into v_to_group
    from public.quran_divisions d
    where v_to_idx between d.from_index and d.to_index
    order by d.rub_no limit 1;

    select min(d.from_index)::integer
      into v_from_group_start
    from public.quran_divisions d
    where (case p_unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no end)=v_from_group;

    select max(d.to_index)::integer
      into v_to_group_end
    from public.quran_divisions d
    where (case p_unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no end)=v_to_group;

    -- إذا كان الحد غير منطبق تمامًا على تقسيم الحزب فلا نسمّيه حزبًا كاملًا.
    if v_from_idx=v_from_group_start and v_to_idx=v_to_group_end then
      v_from_label:=private.quran_division_atom_label(p_unit,v_from_group);
      v_to_label:=private.quran_division_atom_label(p_unit,v_to_group);
      if v_from_group=v_to_group then return v_from_label; end if;
      return 'من '||v_from_label||' إلى '||v_to_label;
    end if;
  end if;

  f_name:=coalesce(nullif(p_from->>'surahName',''),nullif(p_from->>'surah',''));
  t_name:=coalesce(nullif(p_to->>'surahName',''),nullif(p_to->>'surah',''));
  if f_name is null and f_surah is not null then
    select min(name_ar) into f_name from public.quran_ayahs where surah_no=f_surah;
  end if;
  if t_name is null and t_surah is not null then
    select min(name_ar) into t_name from public.quran_ayahs where surah_no=t_surah;
  end if;
  if f_surah is not null then select max(ayah_no) into f_max from public.quran_ayahs where surah_no=f_surah; end if;
  if t_surah is not null then select max(ayah_no) into t_max from public.quran_ayahs where surah_no=t_surah; end if;

  if f_surah=t_surah then
    if f_ayah=1 and t_ayah=t_max then return 'سورة '||f_name||' كاملة'; end if;
    return 'سورة '||coalesce(f_name,'')||': '||coalesce(f_ayah::text,'')||'–'||coalesce(t_ayah::text,'');
  end if;

  if f_ayah=1 and t_ayah=t_max then
    return 'من سورة '||coalesce(f_name,'')||' إلى سورة '||coalesce(t_name,'');
  end if;
  return 'من سورة '||coalesce(f_name,'')||': '||coalesce(f_ayah::text,'')||
         ' إلى سورة '||coalesce(t_name,'')||': '||coalesce(t_ayah::text,'');
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_complete_ayah_line_chunks(p_start_surah integer, p_start_ayah integer, p_direction plan_direction, p_target_lines integer)
 RETURNS TABLE(day_no integer, from_index integer, to_index integer, from_page integer, to_page integer, from_line integer, to_line integer, target_lines integer, actual_lines integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_n integer;
  v_cursor integer:=1;
  v_candidate integer;
  v_chosen integer;
  v_prev_lines integer;
  v_cur_lines integer;
  v_chosen_lines integer;
  v_day integer:=0;
  v_from record;
  v_to record;
begin
  if p_target_lines is null or p_target_lines<1 or p_target_lines>45 then
    raise exception 'مقدار الأسطر يجب أن يكون بين 1 و45.';
  end if;
  if not exists(
    select 1 from public.quran_ayahs q
    where q.surah_no=p_start_surah and q.ayah_no=p_start_ayah
  ) then
    raise exception 'آية البداية غير موجودة.';
  end if;

  create temporary table if not exists _sanabil_complete_ayah_sequence(
    seq integer primary key,
    ayah_index integer not null,
    surah_no integer not null,
    ayah_no integer not null,
    page_no integer,
    line_start integer,
    line_end integer
  ) on commit drop;
  truncate _sanabil_complete_ayah_sequence;

  insert into _sanabil_complete_ayah_sequence(
    seq,ayah_index,surah_no,ayah_no,page_no,line_start,line_end
  )
  select
    row_number() over(
      order by
        case when p_direction='toward_nas'::public.plan_direction
             then q.surah_no else -q.surah_no end,
        q.ayah_no
    )::integer,
    q.ayah_index,q.surah_no,q.ayah_no,
    q.page_no::integer,q.line_start::integer,q.line_end::integer
  from public.quran_ayahs q
  where
    (p_direction='toward_nas'::public.plan_direction
      and (q.surah_no>p_start_surah
           or (q.surah_no=p_start_surah and q.ayah_no>=p_start_ayah)))
    or
    (p_direction='toward_fatiha'::public.plan_direction
      and (q.surah_no<p_start_surah
           or (q.surah_no=p_start_surah and q.ayah_no>=p_start_ayah)));

  select count(*) into v_n from _sanabil_complete_ayah_sequence;
  if v_n=0 then
    raise exception 'تعذر بناء تسلسل الحفظ من موضع البداية.';
  end if;

  while v_cursor<=v_n loop
    v_candidate:=v_cursor;
    v_chosen:=v_cursor;
    v_prev_lines:=null;
    v_chosen_lines:=null;

    loop
      select count(*)::integer into v_cur_lines
      from (
        select distinct q.page_no::integer page_no, ln::integer line_no
        from _sanabil_complete_ayah_sequence a
        join public.quran_ayahs q on q.ayah_index=a.ayah_index
        cross join lateral generate_series(
          q.line_start::integer,q.line_end::integer
        ) ln
        where a.seq between v_cursor and v_candidate
      ) x;

      if v_candidate=v_cursor and v_cur_lines>=p_target_lines then
        -- لا يمكن تقسيم الآية الواحدة؛ إن تجاوزت وحدها المقدار تؤخذ كاملة.
        v_chosen:=v_candidate;
        v_chosen_lines:=v_cur_lines;
        exit;
      elsif v_cur_lines=p_target_lines then
        v_chosen:=v_candidate;
        v_chosen_lines:=v_cur_lines;
        exit;
      elsif v_cur_lines>p_target_lines then
        -- لا نضيف آية جديدة إذا كانت ستتجاوز المقدار.
        v_chosen:=v_candidate-1;
        v_chosen_lines:=v_prev_lines;
        exit;
      end if;

      if v_candidate>=v_n then
        v_chosen:=v_n;
        v_chosen_lines:=v_cur_lines;
        exit;
      end if;

      v_prev_lines:=v_cur_lines;
      v_candidate:=v_candidate+1;
    end loop;

    select * into v_from
    from _sanabil_complete_ayah_sequence where seq=v_cursor;
    select * into v_to
    from _sanabil_complete_ayah_sequence where seq=v_chosen;

    v_day:=v_day+1;
    day_no:=v_day;
    from_index:=v_from.ayah_index;
    to_index:=v_to.ayah_index;
    from_page:=v_from.page_no;
    to_page:=v_to.page_no;
    from_line:=v_from.line_start;
    to_line:=v_to.line_end;
    target_lines:=p_target_lines;
    actual_lines:=v_chosen_lines;
    return next;

    v_cursor:=v_chosen+1;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_memorization_line_chunks(p_start_surah integer, p_start_ayah integer, p_direction plan_direction, p_target_lines integer)
 RETURNS TABLE(day_seq integer, from_index integer, to_index integer, from_page integer, to_page integer, from_line integer, to_line integer, actual_lines integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_s integer:=p_start_surah;
  v_a integer:=p_start_ayah;
  v_day integer:=0;
  v_startq record;
  v_endq record;
  v_chunk record;
  v_max_ayah integer;
  v_guard integer:=0;
begin
  if p_target_lines is null or p_target_lines<1 or p_target_lines>45 then
    raise exception 'مقدار الأسطر يجب أن يكون بين 1 و45.';
  end if;

  loop
    v_guard:=v_guard+1;
    if v_guard>10000 then raise exception 'تعذر إكمال توزيع الخطة.'; end if;

    select q.ayah_index,q.page_no::integer page_no,q.line_start::integer line_start
    into v_startq
    from public.quran_ayahs q
    where q.surah_no=v_s and q.ayah_no=v_a;
    exit when not found;

    select * into v_chunk
    from private.quran_whole_ayah_line_chunk(v_s,v_a,p_direction,p_target_lines);
    exit when not found;

    select q.ayah_index,q.page_no::integer page_no,q.line_end::integer line_end
    into v_endq
    from public.quran_ayahs q
    where q.surah_no=v_chunk.end_surah and q.ayah_no=v_chunk.end_ayah;
    exit when not found;

    v_day:=v_day+1;
    day_seq:=v_day;
    from_index:=v_startq.ayah_index;
    to_index:=v_endq.ayah_index;
    from_page:=v_startq.page_no;
    to_page:=v_endq.page_no;
    from_line:=v_startq.line_start;
    to_line:=v_endq.line_end;
    actual_lines:=v_chunk.actual_lines;
    return next;

    select max(q.ayah_no)::integer into v_max_ayah
    from public.quran_ayahs q
    where q.surah_no=v_chunk.end_surah;

    if v_chunk.end_ayah<v_max_ayah then
      v_s:=v_chunk.end_surah;
      v_a:=v_chunk.end_ayah+1;
    else
      if p_direction='toward_nas'::public.plan_direction then
        exit when v_chunk.end_surah>=114;
        v_s:=v_chunk.end_surah+1;
        v_a:=1;
      else
        exit when v_chunk.end_surah<=1;
        v_s:=v_chunk.end_surah-1;
        v_a:=1;
      end if;
    end if;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_plan_atoms(p_start_surah integer, p_start_ayah integer, p_direction plan_direction, p_unit plan_unit)
 RETURNS TABLE(seq integer, atom_surah integer, from_index integer, to_index integer, from_page integer, to_page integer, from_line integer, to_line integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with startq as (
  select q.surah_no,q.ayah_no,q.ayah_index,q.page_no,q.line_start,q.line_end
  from public.quran_ayahs q
  where q.surah_no=p_start_surah and q.ayah_no=p_start_ayah
),
eligible_surahs as (
  select distinct q.surah_no
  from public.quran_ayahs q cross join startq s
  where (p_direction='toward_nas'::public.plan_direction and q.surah_no>=s.surah_no)
     or (p_direction='toward_fatiha'::public.plan_direction and q.surah_no<=s.surah_no)
),
ayah_atoms as (
  select q.surah_no atom_surah,q.ayah_index from_index,q.ayah_index to_index,
         q.page_no::integer from_page,q.page_no::integer to_page,
         null::integer from_line,null::integer to_line,q.ayah_no atom_pos
  from public.quran_ayahs q
  join eligible_surahs es on es.surah_no=q.surah_no
  cross join startq s
  where p_unit::text='ayahs'
    and (q.surah_no<>s.surah_no or q.ayah_index>=s.ayah_index)
),
page_group as (
  select q.surah_no,q.page_no::integer page_no,
         min(q.ayah_index)::integer min_idx,max(q.ayah_index)::integer max_idx
  from public.quran_ayahs q
  join eligible_surahs es on es.surah_no=q.surah_no
  group by q.surah_no,q.page_no
),
page_atoms as (
  select g.surah_no atom_surah,
         case when g.surah_no=s.surah_no and g.min_idx<s.ayah_index and g.max_idx>=s.ayah_index
              then s.ayah_index else g.min_idx end from_index,
         g.max_idx to_index,g.page_no from_page,g.page_no to_page,
         null::integer from_line,null::integer to_line,g.page_no atom_pos
  from page_group g cross join startq s
  where p_unit::text='pages'
    and (g.surah_no<>s.surah_no or g.max_idx>=s.ayah_index)
),
line_expanded as (
  select q.surah_no,q.page_no::integer page_no,ln::integer line_no,q.ayah_index
  from public.quran_ayahs q
  join eligible_surahs es on es.surah_no=q.surah_no
  cross join lateral generate_series(q.line_start::integer,q.line_end::integer) ln
),
line_group as (
  select surah_no,page_no,line_no,min(ayah_index)::integer min_idx,max(ayah_index)::integer max_idx
  from line_expanded group by surah_no,page_no,line_no
),
line_atoms as (
  select g.surah_no atom_surah,
         case when g.surah_no=s.surah_no and g.min_idx<s.ayah_index and g.max_idx>=s.ayah_index
              then s.ayah_index else g.min_idx end from_index,
         g.max_idx to_index,g.page_no from_page,g.page_no to_page,
         g.line_no from_line,g.line_no to_line,(g.page_no*100+g.line_no) atom_pos
  from line_group g cross join startq s
  where p_unit::text='lines'
    and (g.surah_no<>s.surah_no or g.max_idx>=s.ayah_index)
),
surah_group as (
  select q.surah_no,min(q.ayah_index)::integer min_idx,max(q.ayah_index)::integer max_idx,
         min(q.page_no)::integer min_page,max(q.page_no)::integer max_page
  from public.quran_ayahs q join eligible_surahs es on es.surah_no=q.surah_no
  group by q.surah_no
),
surah_atoms as (
  select g.surah_no atom_surah,
         case when g.surah_no=s.surah_no then s.ayah_index else g.min_idx end from_index,
         g.max_idx to_index,
         case when g.surah_no=s.surah_no then s.page_no::integer else g.min_page end from_page,
         g.max_page to_page,null::integer from_line,null::integer to_line,1 atom_pos
  from surah_group g cross join startq s
  where p_unit::text='surahs'
),
division_group as (
  select
    case p_unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no
    end group_key,
    min(d.from_index)::integer from_index,
    max(d.to_index)::integer to_index,
    min(d.from_page)::integer from_page,
    max(d.to_page)::integer to_page
  from public.quran_divisions d
  where p_unit::text in('quarter_hizb','half_hizb','hizb','juz')
  group by 1
),
start_division as (
  select dg.group_key
  from division_group dg cross join startq s
  where s.ayah_index between dg.from_index and dg.to_index
  order by dg.group_key limit 1
),
division_atoms as (
  select q.surah_no::integer atom_surah,
         dg.from_index,dg.to_index,dg.from_page,dg.to_page,
         null::integer from_line,null::integer to_line,dg.group_key atom_pos
  from division_group dg
  cross join start_division sd
  join public.quran_ayahs q on q.ayah_index=dg.from_index
  where (p_direction='toward_nas'::public.plan_direction and dg.group_key>=sd.group_key)
     or (p_direction='toward_fatiha'::public.plan_direction and dg.group_key<=sd.group_key)
),
all_atoms as (
  select * from ayah_atoms
  union all select * from page_atoms
  union all select * from line_atoms
  union all select * from surah_atoms
  union all select * from division_atoms
)
select row_number() over(
         order by
           case
             when p_unit::text in('quarter_hizb','half_hizb','hizb','juz') and p_direction='toward_fatiha'::public.plan_direction then -atom_pos
             when p_unit::text in('quarter_hizb','half_hizb','hizb','juz') then atom_pos
             when p_direction='toward_nas'::public.plan_direction then atom_surah
             else -atom_surah
           end,
           case when p_unit::text in('quarter_hizb','half_hizb','hizb','juz') then 0 else atom_pos end,
           from_index
       )::integer seq,
       atom_surah,from_index,to_index,from_page,to_page,from_line,to_line
from all_atoms
order by seq;
$function$;
CREATE OR REPLACE FUNCTION private.quran_range_segments(p_from_index integer, p_to_index integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with r as (
    select q.surah_no,
           min(q.ayah_index)::integer min_idx,
           max(q.ayah_index)::integer max_idx,
           min(q.page_no)::integer min_page,
           max(q.page_no)::integer max_page
    from public.quran_ayahs q
    where q.ayah_index between least(p_from_index,p_to_index) and greatest(p_from_index,p_to_index)
    group by q.surah_no
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'surahNo',r.surah_no,
    'surahName',(select q.name_ar from public.quran_ayahs q where q.surah_no=r.surah_no order by q.ayah_no limit 1),
    'from',private.quran_target_ref(r.min_idx,r.min_page,null),
    'to',private.quran_target_ref(r.max_idx,r.max_page,null)
  ) order by r.surah_no),'[]'::jsonb)
  from r;
$function$;
CREATE OR REPLACE FUNCTION private.quran_ref_label(p_from jsonb, p_to jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  f_surah text := coalesce(p_from->>'surahName',p_from->>'surah','');
  t_surah text := coalesce(p_to->>'surahName',p_to->>'surah','');
  f_ayah text := coalesce(p_from->>'ayahNo',p_from->>'ayah','');
  t_ayah text := coalesce(p_to->>'ayahNo',p_to->>'ayah','');
begin
  if p_from is null or p_to is null then return null; end if;
  if f_surah = t_surah then
    return 'سورة '||f_surah||': '||f_ayah||'–'||t_ayah;
  end if;
  return 'من '||f_surah||': '||f_ayah||' إلى '||t_surah||': '||t_ayah;
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_segments_label(p_segments jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select nullif(string_agg(
    'سورة '||coalesce(x.value->>'surahName',x.value->'from'->>'surahName','')||
    ': '||coalesce(x.value->'from'->>'ayahNo','')||'–'||coalesce(x.value->'to'->>'ayahNo',''),
    '، ثم ' order by x.ordinality
  ),'')
  from jsonb_array_elements(coalesce(p_segments,'[]'::jsonb)) with ordinality x(value,ordinality);
$function$;
CREATE OR REPLACE FUNCTION private.quran_target_ref(p_ayah_index integer, p_page_no integer DEFAULT NULL::integer, p_line_no integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'surahNo', q.surah_no,
    'surahName', q.name_ar,
    'surah', q.name_ar,
    'ayahNo', q.ayah_no,
    'ayah', q.ayah_no,
    'pageNo', coalesce(p_page_no, q.page_no::integer),
    'lineNo', p_line_no,
    'juzNo', q.juz_no,
    'ayahIndex', q.ayah_index
  ))
  from public.quran_ayahs q
  where q.ayah_index = p_ayah_index
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION private.quran_whole_ayah_line_chunk(p_start_surah integer, p_start_ayah integer, p_direction plan_direction, p_target_lines numeric)
 RETURNS TABLE(end_surah integer, end_ayah integer, end_index integer, actual_lines integer, target_lines numeric, delta numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_target integer:=greatest(1,round(p_target_lines)::integer);
  v_s integer:=p_start_surah;
  v_a integer:=p_start_ayah;
  v_q record;
  v_max_ayah integer;
  v_total integer:=0;
  v_next_total integer;
  v_prev_s integer:=null;
  v_prev_a integer:=null;
  v_prev_idx integer:=null;
  v_prev_page integer:=null;
  v_prev_start integer:=null;
  v_prev_end integer:=null;
  v_added integer;
  v_overlap integer;
  v_guard integer:=0;
  v_is_first boolean:=true;
begin
  if not exists(
    select 1 from public.quran_ayahs q
    where q.surah_no=v_s and q.ayah_no=v_a
  ) then
    raise exception 'آية البداية غير موجودة.';
  end if;

  loop
    v_guard:=v_guard+1;
    if v_guard>1000 then raise exception 'تعذر تحديد نهاية الدرس.'; end if;

    select q.surah_no::integer surah_no,q.ayah_no::integer ayah_no,
           q.ayah_index::integer ayah_index,q.page_no::integer page_no,
           q.line_start::integer line_start,q.line_end::integer line_end
    into v_q
    from public.quran_ayahs q
    where q.surah_no=v_s and q.ayah_no=v_a;

    if not found then exit; end if;

    v_added:=v_q.line_end-v_q.line_start+1;
    if v_prev_page is not null and v_prev_page=v_q.page_no then
      v_overlap:=greatest(
        0,
        least(v_prev_end,v_q.line_end)-greatest(v_prev_start,v_q.line_start)+1
      );
      v_added:=greatest(0,v_added-v_overlap);
    end if;
    v_next_total:=v_total+v_added;

    if v_is_first and v_next_total>=v_target then
      end_surah:=v_q.surah_no;
      end_ayah:=v_q.ayah_no;
      end_index:=v_q.ayah_index;
      actual_lines:=v_next_total;
      target_lines:=p_target_lines;
      delta:=abs(actual_lines::numeric-p_target_lines);
      return next; return;

    elsif v_next_total=v_target then
      end_surah:=v_q.surah_no;
      end_ayah:=v_q.ayah_no;
      end_index:=v_q.ayah_index;
      actual_lines:=v_next_total;
      target_lines:=p_target_lines;
      delta:=0;
      return next; return;

    elsif v_next_total>v_target then
      -- لا نقسم الآية: نختار أقرب نهاية آية للمقدار المستهدف.
      -- عند تساوي الفرق نرجح إدخال الآية التالية (الزيادة).
      if (v_next_total-v_target) <= (v_target-v_total) then
        end_surah:=v_q.surah_no;
        end_ayah:=v_q.ayah_no;
        end_index:=v_q.ayah_index;
        actual_lines:=v_next_total;
      else
        end_surah:=v_prev_s;
        end_ayah:=v_prev_a;
        end_index:=v_prev_idx;
        actual_lines:=v_total;
      end if;
      target_lines:=p_target_lines;
      delta:=abs(actual_lines::numeric-p_target_lines);
      return next; return;
    end if;

    v_total:=v_next_total;
    v_is_first:=false;
    v_prev_s:=v_q.surah_no;
    v_prev_a:=v_q.ayah_no;
    v_prev_idx:=v_q.ayah_index;
    v_prev_page:=v_q.page_no;
    v_prev_start:=v_q.line_start;
    v_prev_end:=v_q.line_end;

    select max(q.ayah_no)::integer into v_max_ayah
    from public.quran_ayahs q where q.surah_no=v_s;

    if v_a<v_max_ayah then
      v_a:=v_a+1;
    else
      if p_direction='toward_nas'::public.plan_direction then
        if v_s>=114 then
          end_surah:=v_q.surah_no;end_ayah:=v_q.ayah_no;
          end_index:=v_q.ayah_index;actual_lines:=v_total;
          target_lines:=p_target_lines;
          delta:=abs(v_total::numeric-p_target_lines);
          return next;return;
        end if;
        v_s:=v_s+1;v_a:=1;
      else
        if v_s<=1 then
          end_surah:=v_q.surah_no;end_ayah:=v_q.ayah_no;
          end_index:=v_q.ayah_index;actual_lines:=v_total;
          target_lines:=p_target_lines;
          delta:=abs(v_total::numeric-p_target_lines);
          return next;return;
        end if;
        v_s:=v_s-1;v_a:=1;
      end if;
    end if;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION private.rebuild_linear_major_review_against_recent(p_plan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_plan public.plans%rowtype;
  v_recent public.plans%rowtype;
  v_preserve_until date;
  v_last public.plan_days%rowtype;
  v_start_mode text;
  v_auto_major boolean:=false;
  v_cycle_days integer:=5;
  v_start_idx integer;
  v_cursor_idx integer;
  v_recent_end integer;
  v_lower integer;
  v_upper integer:=6236;
  v_date date;
  v_cycle integer:=1;
  v_daily_amount integer;
  v_total_atoms integer;
  v_selected integer;
  v_from_idx integer;
  v_to_idx integer;
  v_from_page integer;
  v_to_page integer;
  v_from_line integer;
  v_to_line integer;
  v_segments jsonb;
  v_generated integer:=0;
  v_q public.quran_ayahs%rowtype;
begin
  select * into v_plan from public.plans where id=p_plan_id for update;
  if not found or v_plan.type<>'review' then
    raise exception 'خطة المراجعة الكبرى غير موجودة.';
  end if;
  if v_plan.unit::text not in('pages','ayahs','surahs') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','not_linear_unit');
  end if;

  v_start_mode:=coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy');
  if v_start_mode not in('lesson','surah') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','legacy_mode');
  end if;

  v_auto_major:=coalesce((v_plan.methodology_meta->>'autoMajor')::boolean,false);
  v_cycle_days:=greatest(1,least(30,coalesce(nullif(v_plan.methodology_meta->>'cycleDays','')::integer,5)));

  select * into v_recent
  from public.plans p
  where p.student_id=v_plan.student_id and p.status='active' and p.type='recent_review'
    and p.start_date<=v_plan.end_date and p.end_date>=v_plan.start_date
  order by p.updated_at desc,p.created_at desc limit 1;

  if v_recent.id is null then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','no_recent_review');
  end if;

  v_start_idx:=nullif(v_plan.start_ref->>'ayahIndex','')::integer;
  if v_start_idx is null then
    select q.ayah_index into v_start_idx
    from public.quran_ayahs q
    where q.surah_no=coalesce(nullif(v_plan.start_ref->>'surahNo','')::integer,nullif(v_plan.start_ref->>'surah','')::integer)
      and q.ayah_no=coalesce(nullif(v_plan.start_ref->>'ayahNo','')::integer,nullif(v_plan.start_ref->>'ayah','')::integer)
    limit 1;
  end if;

  select max(pd.date_key) into v_preserve_until
  from public.plan_days pd
  where pd.plan_id=v_plan.id
    and (
      pd.rating is not null or coalesce(pd.completed_amount,0)>0 or
      coalesce(pd.carry_in,0)>0 or coalesce(pd.carry_out,0)>0 or
      pd.status<>'planned' or pd.notes is not null
    );

  if v_preserve_until is not null then
    select * into v_last
    from public.plan_days pd
    where pd.plan_id=v_plan.id and pd.date_key=v_preserve_until
    order by pd.updated_at desc limit 1;
    v_cycle:=coalesce(v_last.cycle_no,1);
    v_cursor_idx:=coalesce(nullif(v_last.target_to->>'ayahIndex','')::integer,0)+1;
  end if;

  delete from public.plan_days pd
  where pd.plan_id=v_plan.id and (v_preserve_until is null or pd.date_key>v_preserve_until);

  create temporary table if not exists _sanabil_linear_review_atoms(
    seq integer primary key,
    atom_surah integer,
    from_index integer,
    to_index integer,
    from_page integer,
    to_page integer,
    from_line integer,
    to_line integer
  ) on commit drop;

  for v_date in
    select d::date
    from generate_series(
      greatest(v_plan.start_date,coalesce(v_preserve_until+1,v_plan.start_date)),
      v_plan.end_date,
      interval '1 day'
    ) d
    where not(extract(dow from d)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
      and not(d::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
    order by d
  loop
    select nullif(pd.target_to->>'ayahIndex','')::integer into v_recent_end
    from public.plan_days pd
    where pd.plan_id=v_recent.id and pd.date_key<=v_date and pd.target_to is not null
    order by pd.date_key desc limit 1;

    if v_recent_end is null then continue; end if;
    v_lower:=least(6237,v_recent_end+1);
    if v_lower>v_upper then continue; end if;

    if v_cursor_idx is null then
      if v_start_mode='surah' and v_start_idx between v_lower and v_upper then
        v_cursor_idx:=v_start_idx;
      else
        v_cursor_idx:=v_lower;
      end if;
    elsif v_cursor_idx<v_lower or v_cursor_idx>v_upper then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
    end if;

    select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
    if not found then
      v_cursor_idx:=v_lower;
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
    end if;

    truncate _sanabil_linear_review_atoms;
    insert into _sanabil_linear_review_atoms
    select * from private.quran_plan_atoms(
      v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
    );

    delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_cursor_idx;

    select count(*)::integer into v_total_atoms from _sanabil_linear_review_atoms;
    if coalesce(v_total_atoms,0)=0 then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
      continue;
    end if;

    v_daily_amount:=greatest(1,coalesce(v_plan.daily_amount,1));
    if v_auto_major then
      -- يحسب مقدار الدورة من كامل المسافة بعد المراجعة الصغرى، لا من موضع المؤشر فقط.
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_lower limit 1;
      truncate _sanabil_linear_review_atoms;
      insert into _sanabil_linear_review_atoms
      select * from private.quran_plan_atoms(
        v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
      );
      delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_lower;
      select count(*)::integer into v_total_atoms from _sanabil_linear_review_atoms;
      v_daily_amount:=greatest(1,least(45,ceil(v_total_atoms::numeric/v_cycle_days)::integer));

      -- أعد بناء الذرات من موضع المؤشر الحالي بعد حساب المقدار.
      select * into v_q from public.quran_ayahs q where q.ayah_index=v_cursor_idx limit 1;
      truncate _sanabil_linear_review_atoms;
      insert into _sanabil_linear_review_atoms
      select * from private.quran_plan_atoms(
        v_q.surah_no,v_q.ayah_no,'toward_nas'::public.plan_direction,v_plan.unit
      );
      delete from _sanabil_linear_review_atoms where from_index>v_upper or to_index<v_cursor_idx;
    end if;

    select count(*)::integer,
           min(from_index)::integer,
           max(to_index)::integer,
           min(from_page)::integer,
           max(to_page)::integer,
           min(from_line)::integer,
           max(to_line)::integer
    into v_selected,v_from_idx,v_to_idx,v_from_page,v_to_page,v_from_line,v_to_line
    from (
      select * from _sanabil_linear_review_atoms order by seq limit v_daily_amount
    ) x;

    if coalesce(v_selected,0)=0 or v_from_idx is null or v_to_idx is null then continue; end if;
    v_from_idx:=greatest(v_from_idx,v_lower);
    v_to_idx:=least(v_to_idx,v_upper);
    v_segments:=private.quran_range_segments(v_from_idx,v_to_idx);

    insert into public.plan_days(
      plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
      target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
    ) values(
      v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,v_date,
      private.quran_target_ref(v_from_idx,v_from_page,v_from_line),
      private.quran_target_ref(v_to_idx,v_to_page,v_to_line),
      v_selected,'planned',v_actor,v_actor,v_cycle,v_segments
    );

    v_generated:=v_generated+1;
    v_cursor_idx:=v_to_idx+1;
    if v_cursor_idx>v_upper then
      v_cursor_idx:=v_lower;
      v_cycle:=v_cycle+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'planId',v_plan.id,'recentReviewPlanId',v_recent.id,
    'generatedDays',v_generated,'preservedThrough',v_preserve_until,
    'reviewStartMode',v_start_mode,'autoMajor',v_auto_major,'cycleDays',v_cycle_days,
    'rule','linear_major_review_starts_after_recent_and_covers_all_memorized'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.rebuild_qpc_major_review_against_recent(p_plan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_plan public.plans%rowtype;
  v_recent public.plans%rowtype;
  v_last public.plan_days%rowtype;
  v_preserve_until date;
  v_start_idx integer;
  v_start_group integer;
  v_start_group_to integer;
  v_pair_lower integer;
  v_pair_upper integer;
  v_recent_end integer;
  v_lower integer;
  v_upper integer;
  v_min_group integer;
  v_max_group integer;
  v_cursor_group integer;
  v_cycle integer:=1;
  v_date date;
  v_generated integer:=0;
  v_selected integer;
  v_sel_min_group integer;
  v_sel_max_group integer;
  v_raw_from integer;
  v_raw_to integer;
  v_exact_from integer;
  v_exact_to integer;
  v_from_page integer;
  v_to_page integer;
  v_segments jsonb;
  v_start_mode text;
  v_auto_major boolean:=false;
  v_cycle_days integer:=5;
  v_daily_amount integer;
begin
  select * into v_plan from public.plans where id=p_plan_id for update;
  if not found or v_plan.type<>'review' then
    raise exception 'خطة المراجعة الكبرى غير موجودة.';
  end if;
  if v_plan.unit::text not in('quarter_hizb','half_hizb','hizb','juz') then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','not_qpc_unit');
  end if;

  v_start_mode:=coalesce(v_plan.methodology_meta->>'reviewStartMode','legacy');
  v_auto_major:=coalesce((v_plan.methodology_meta->>'autoMajor')::boolean,false);
  v_cycle_days:=greatest(1,least(30,coalesce(nullif(v_plan.methodology_meta->>'cycleDays','')::integer,5)));

  select * into v_recent
  from public.plans p
  where p.student_id=v_plan.student_id and p.status='active' and p.type='recent_review'
    and p.start_date<=v_plan.end_date and p.end_date>=v_plan.start_date
  order by p.updated_at desc,p.created_at desc limit 1;

  if v_recent.id is null then
    return jsonb_build_object('ok',true,'planId',p_plan_id,'skipped',true,'reason','no_recent_review');
  end if;

  create temporary table if not exists _sanabil_qpc_groups(
    group_key integer primary key,
    from_index integer,
    to_index integer,
    from_page integer,
    to_page integer
  ) on commit drop;
  truncate _sanabil_qpc_groups;
  -- Keep future assignments in a transaction-local batch; persist once.
  create temporary table if not exists _sanabil_qpc_pending(
    date_key date primary key,
    from_index integer not null,
    to_index integer not null,
    units integer not null,
    cycle integer not null
  ) on commit drop;
  truncate _sanabil_qpc_pending;

  insert into _sanabil_qpc_groups(group_key,from_index,to_index,from_page,to_page)
  select
    case v_plan.unit::text
      when 'quarter_hizb' then d.rub_no
      when 'half_hizb' then ceil(d.rub_no::numeric/2)::integer
      when 'hizb' then d.hizb_no
      when 'juz' then d.juz_no
    end,
    min(d.from_index)::integer,
    max(d.to_index)::integer,
    min(d.from_page)::integer,
    max(d.to_page)::integer
  from public.quran_divisions d
  group by 1;

  v_start_idx:=nullif(v_plan.start_ref->>'ayahIndex','')::integer;
  if v_start_idx is null then
    select q.ayah_index into v_start_idx
    from public.quran_ayahs q
    where q.surah_no=coalesce(nullif(v_plan.start_ref->>'surahNo','')::integer,nullif(v_plan.start_ref->>'surah','')::integer)
      and q.ayah_no=coalesce(nullif(v_plan.start_ref->>'ayahNo','')::integer,nullif(v_plan.start_ref->>'ayah','')::integer)
    limit 1;
  end if;

  select g.group_key,g.to_index into v_start_group,v_start_group_to
  from _sanabil_qpc_groups g
  where v_start_idx between g.from_index and g.to_index
  limit 1;

  if v_start_group is null then
    raise exception 'تعذر تحديد وحدة بداية المراجعة الكبرى.';
  end if;

  if v_plan.range_end_rub is not null then
    select d.from_index,d.to_index into v_pair_lower,v_pair_upper
    from public.quran_divisions d where d.rub_no=v_plan.range_end_rub;
  end if;

  select max(pd.date_key) into v_preserve_until
  from public.plan_days pd
  where pd.plan_id=v_plan.id
    and (
      pd.rating is not null or coalesce(pd.completed_amount,0)>0 or
      coalesce(pd.carry_in,0)>0 or coalesce(pd.carry_out,0)>0 or
      pd.status<>'planned' or pd.notes is not null
    );

  if v_preserve_until is not null then
    select * into v_last
    from public.plan_days pd
    where pd.plan_id=v_plan.id and pd.date_key=v_preserve_until
    order by pd.updated_at desc limit 1;

    v_cycle:=coalesce(v_last.cycle_no,1);
    if v_plan.direction='toward_fatiha'::public.plan_direction then
      select g.group_key-1 into v_cursor_group
      from _sanabil_qpc_groups g
      where (v_last.target_from->>'ayahIndex')::integer between g.from_index and g.to_index limit 1;
    else
      select g.group_key+1 into v_cursor_group
      from _sanabil_qpc_groups g
      where (v_last.target_to->>'ayahIndex')::integer between g.from_index and g.to_index limit 1;
    end if;
  end if;

  delete from public.plan_days pd
  where pd.plan_id=v_plan.id and (v_preserve_until is null or pd.date_key>v_preserve_until);

  for v_date in
    select d::date
    from generate_series(
      greatest(v_plan.start_date,coalesce(v_preserve_until+1,v_plan.start_date)),
      v_plan.end_date,
      interval '1 day'
    ) d
    where not(extract(dow from d)::smallint=any(coalesce(v_plan.excluded_weekdays,'{}'::smallint[])))
      and not(d::date=any(coalesce(v_plan.excluded_dates,'{}'::date[])))
    order by d
  loop
    select nullif(pd.target_to->>'ayahIndex','')::integer
      into v_recent_end
    from public.plan_days pd
    where pd.plan_id=v_recent.id and pd.date_key<=v_date and pd.target_to is not null
    order by pd.date_key desc limit 1;

    if v_recent_end is null then continue; end if;

    -- التغطية الأساسية: تبدأ بعد المراجعة الصغرى مباشرة وتمتد إلى نهاية المحفوظ نحو الناس.
    v_lower:=least(6237,v_recent_end+1);
    v_upper:=6236;

    -- التوافق مع الخطط القديمة التي حددت حدًا صريحًا للمراجعة.
    if v_start_mode='legacy' then
      if v_plan.direction='toward_fatiha'::public.plan_direction then
        v_upper:=v_start_group_to;
        if v_pair_lower is not null then v_lower:=greatest(v_lower,v_pair_lower); end if;
      else
        if v_pair_upper is not null then v_upper:=least(v_upper,v_pair_upper); end if;
      end if;
    end if;

    if v_lower>v_upper then continue; end if;

    select min(g.group_key),max(g.group_key)
      into v_min_group,v_max_group
    from _sanabil_qpc_groups g
    where g.to_index>=v_lower and g.from_index<=v_upper;

    if v_min_group is null or v_max_group is null then continue; end if;

    if v_cursor_group is null then
      if v_start_mode='surah' and v_start_group between v_min_group and v_max_group then
        v_cursor_group:=v_start_group;
      else
        v_cursor_group:=case when v_plan.direction='toward_fatiha'::public.plan_direction
          then v_max_group else v_min_group end;
      end if;
    elsif v_cursor_group<v_min_group or v_cursor_group>v_max_group then
      v_cursor_group:=case when v_plan.direction='toward_fatiha'::public.plan_direction
        then v_max_group else v_min_group end;
      v_cycle:=v_cycle+1;
    end if;

    v_daily_amount:=greatest(1,coalesce(v_plan.daily_amount,1));
    if v_auto_major then
      v_daily_amount:=greatest(
        1,
        least(
          45,
          ceil((v_max_group-v_min_group+1)::numeric/v_cycle_days)::integer
        )
      );
    end if;

    if v_plan.direction='toward_fatiha'::public.plan_direction then
      select count(*)::integer,min(group_key),max(group_key),min(from_index),max(to_index)
        into v_selected,v_sel_min_group,v_sel_max_group,v_raw_from,v_raw_to
      from (
        select * from _sanabil_qpc_groups
        where group_key between v_min_group and v_max_group
          and group_key<=v_cursor_group
        order by group_key desc
        limit v_daily_amount
      ) x;
    else
      select count(*)::integer,min(group_key),max(group_key),min(from_index),max(to_index)
        into v_selected,v_sel_min_group,v_sel_max_group,v_raw_from,v_raw_to
      from (
        select * from _sanabil_qpc_groups
        where group_key between v_min_group and v_max_group
          and group_key>=v_cursor_group
        order by group_key asc
        limit v_daily_amount
      ) x;
    end if;

    if coalesce(v_selected,0)=0 then continue; end if;

    v_exact_from:=greatest(v_raw_from,v_lower);
    v_exact_to:=least(v_raw_to,v_upper);
    if v_exact_from>v_exact_to then continue; end if;

    insert into _sanabil_qpc_pending(date_key,from_index,to_index,units,cycle)
    values(v_date,v_exact_from,v_exact_to,v_selected,v_cycle);

    v_generated:=v_generated+1;
    if v_plan.direction='toward_fatiha'::public.plan_direction then
      v_cursor_group:=v_sel_min_group-1;
    else
      v_cursor_group:=v_sel_max_group+1;
    end if;
  end loop;

  -- Derive pages and Quran segments once per distinct passage, then write all
  -- future lessons in one INSERT. Completed and rated dates were never deleted.
  with unique_spans as materialized (
    select distinct from_index,to_index from _sanabil_qpc_pending
  ),
  passage_refs as materialized (
    select sp.from_index,sp.to_index,
      q_start.page_no::integer as from_page,
      q_end.page_no::integer as to_page,
      private.quran_range_segments(sp.from_index,sp.to_index) as segments
    from unique_spans sp
    join public.quran_ayahs q_start on q_start.ayah_index=sp.from_index
    join public.quran_ayahs q_end on q_end.ayah_index=sp.to_index
  )
  insert into public.plan_days(
    plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
    target_from,target_to,target_amount,status,created_by,updated_by,cycle_no,segments
  )
  select
    v_plan.id,v_plan.org_id,v_plan.complex_id,v_plan.circle_id,v_plan.student_id,v_plan.teacher_id,
    pending.date_key,
    private.quran_target_ref(pending.from_index,refs.from_page,null),
    private.quran_target_ref(pending.to_index,refs.to_page,null),
    pending.units,'planned',v_actor,v_actor,pending.cycle,refs.segments
  from _sanabil_qpc_pending pending
  join passage_refs refs
    on refs.from_index=pending.from_index and refs.to_index=pending.to_index
  order by pending.date_key;

  return jsonb_build_object(
    'ok',true,'planId',v_plan.id,'recentReviewPlanId',v_recent.id,
    'generatedDays',v_generated,'preservedThrough',v_preserve_until,
    'reviewStartMode',v_start_mode,'autoMajor',v_auto_major,'cycleDays',v_cycle_days,
    'rule','major_review_starts_after_recent_and_covers_all_memorized_without_gap'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.sync_recent_review_plan(p_recent_plan_id text, p_mem_plan_id text, p_from_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_recent public.plans%rowtype;
  v_mem public.plans%rowtype;
  v_sync_from date;
  v_mem_day record;
  v_end_idx integer;
  v_end_seq integer;
  v_from_seq integer;
  v_from record;
  v_to record;
  v_segments jsonb;
  v_amount integer;
  v_generated integer:=0;
begin
  select * into v_recent from public.plans where id=p_recent_plan_id for update;
  select * into v_mem from public.plans where id=p_mem_plan_id for update;
  if v_recent.id is null or v_recent.type<>'recent_review' then raise exception 'خطة المراجعة الصغرى غير موجودة.'; end if;
  if v_mem.id is null or v_mem.type<>'memorization' then raise exception 'خطة الحفظ المرتبطة غير موجودة.'; end if;
  if v_recent.student_id<>v_mem.student_id then raise exception 'خطة المراجعة الصغرى لا تخص طالب خطة الحفظ.'; end if;
  if v_recent.unit::text not in('pages','ayahs','surahs') then raise exception 'المراجعة الصغرى تقاس بالصفحات أو الآيات أو السور فقط.'; end if;

  v_sync_from:=greatest(v_recent.start_date,coalesce(p_from_date,v_recent.start_date));

  create temporary table if not exists _sanabil_recent_atoms(
    seq integer primary key,atom_surah integer,from_index integer,to_index integer,
    from_page integer,to_page integer,from_line integer,to_line integer
  ) on commit drop;
  truncate _sanabil_recent_atoms;

  insert into _sanabil_recent_atoms
  select * from private.quran_plan_atoms(
    (v_mem.start_ref->>'surahNo')::integer,
    (v_mem.start_ref->>'ayahNo')::integer,
    v_mem.direction,
    v_recent.unit
  );

  delete from public.plan_days d
  where d.plan_id=v_recent.id and d.date_key>=v_sync_from
    and d.rating is null and coalesce(d.completed_amount,0)=0
    and coalesce(d.carry_in,0)=0 and coalesce(d.carry_out,0)=0;

  for v_mem_day in
    select d.*
    from public.plan_days d
    where d.plan_id=v_mem.id
      and d.date_key between v_sync_from and v_recent.end_date
      and d.date_key between v_recent.start_date and v_recent.end_date
    order by d.date_key
  loop
    if exists(
      select 1 from public.plan_days x
      where x.plan_id=v_recent.id and x.date_key=v_mem_day.date_key
        and (x.rating is not null or coalesce(x.completed_amount,0)>0)
    ) then
      continue;
    end if;

    v_end_idx:=nullif(v_mem_day.target_to->>'ayahIndex','')::integer;
    if v_end_idx is null then
      select q.ayah_index into v_end_idx
      from public.quran_ayahs q
      where q.surah_no=(v_mem_day.target_to->>'surahNo')::integer
        and q.ayah_no=(v_mem_day.target_to->>'ayahNo')::integer;
    end if;

    select a.seq into v_end_seq
    from _sanabil_recent_atoms a
    where v_end_idx between least(a.from_index,a.to_index) and greatest(a.from_index,a.to_index)
    order by a.seq
    limit 1;
    if v_end_seq is null then continue; end if;

    v_from_seq:=greatest(1,v_end_seq-v_recent.daily_amount+1);
    v_amount:=v_end_seq-v_from_seq+1;
    select * into v_from from _sanabil_recent_atoms where seq=v_from_seq;
    select * into v_to from _sanabil_recent_atoms where seq=v_end_seq;

    select coalesce(jsonb_agg(seg.value order by a.seq,seg.ordinality),'[]'::jsonb)
    into v_segments
    from _sanabil_recent_atoms a
    cross join lateral jsonb_array_elements(private.quran_range_segments(a.from_index,a.to_index))
      with ordinality seg(value,ordinality)
    where a.seq between v_from_seq and v_end_seq;

    insert into public.plan_days(
      plan_id,org_id,complex_id,circle_id,student_id,teacher_id,date_key,
      target_from,target_to,target_amount,completed_amount,carry_in,carry_out,
      status,created_by,updated_by,cycle_no,segments
    ) values(
      v_recent.id,v_recent.org_id,v_recent.complex_id,v_recent.circle_id,v_recent.student_id,v_recent.teacher_id,v_mem_day.date_key,
      private.quran_target_ref(v_from.from_index,v_from.from_page,v_from.from_line),
      private.quran_target_ref(v_to.to_index,v_to.to_page,v_to.to_line),
      v_amount,0,0,0,'planned',v_actor,v_actor,1,v_segments
    )
    on conflict(plan_id,date_key) do update set
      target_from=excluded.target_from,target_to=excluded.target_to,target_amount=excluded.target_amount,
      carry_in=0,carry_out=0,segments=excluded.segments,status='planned',
      updated_at=now(),updated_by=v_actor
    where public.plan_days.rating is null and coalesce(public.plan_days.completed_amount,0)=0;

    v_generated:=v_generated+1;
  end loop;

  update public.plans
  set direction=v_mem.direction,start_ref=v_mem.start_ref,cycle_enabled=false,
      updated_at=now(),updated_by=v_actor
  where id=v_recent.id;

  return jsonb_build_object('ok',true,'planId',v_recent.id,'memorizationPlanId',v_mem.id,
    'generatedDays',v_generated,'slidingWindow',true,'fromDate',v_sync_from);
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_division_atom_label(p_unit plan_unit, p_group integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.quran_divisions%rowtype;
  v_hizb text;
begin
  if p_group is null then return null; end if;

  if p_unit::text='quarter_hizb' then
    select * into d from public.quran_divisions where rub_no=p_group;
    if not found then return null; end if;
    v_hizb:=private.quran_hizb_label(d.hizb_no);
    return (case d.quarter_in_hizb when 1 then 'الربع الأول من '
                 when 2 then 'الربع الثاني من '
                 when 3 then 'الربع الثالث من '
                 else 'الربع الرابع من ' end)||v_hizb;

  elsif p_unit::text='half_hizb' then
    select * into d
    from public.quran_divisions
    where rub_no=(p_group*2-1);
    if not found then return null; end if;
    v_hizb:=private.quran_hizb_label(d.hizb_no);
    return (case when d.quarter_in_hizb in(1,2) then 'النصف الأول من ' else 'النصف الثاني من ' end)||v_hizb;

  elsif p_unit::text='hizb' then
    return private.quran_hizb_label(p_group);

  elsif p_unit::text='juz' then
    return 'الجزء '||p_group;
  end if;

  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_hizb_label(p_hizb integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_surah text;
  v_ayah integer;
begin
  select q.name_ar,d.from_ayah
    into v_surah,v_ayah
  from public.quran_divisions d
  join public.quran_ayahs q
    on q.surah_no=d.from_surah and q.ayah_no=d.from_ayah
  where d.hizb_no=p_hizb
  order by d.rub_no
  limit 1;

  if v_surah is null then return 'حزب '||p_hizb; end if;
  if v_ayah=1 then return 'حزب '||v_surah; end if;
  return 'حزب '||p_hizb;
end;
$function$;
CREATE OR REPLACE FUNCTION private.methodology_level_for_position(p_methodology_code text, p_path text, p_surah integer, p_ayah integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_cfg jsonb;
  v_levels jsonb;
  v_level jsonb;
  v_fs integer;
  v_ts integer;
  v_fa integer;
  v_ta integer;
begin
  select m.config into v_cfg
  from private.plan_methodologies m
  where m.code=p_methodology_code and m.active and m.configured
  order by m.updated_at desc limit 1;
  if v_cfg is null then return null; end if;

  if p_methodology_code='aqom' then
    v_levels:=v_cfg->'paths'->coalesce(nullif(p_path,''),'path1')->'levels';
  else
    v_levels:=v_cfg->'levels';
  end if;

  if v_levels is null or jsonb_typeof(v_levels)<>'array' then return null; end if;

  for v_level in select value from jsonb_array_elements(v_levels)
  loop
    v_fs:=(v_level->>'fromSurahNo')::integer;
    v_ts:=(v_level->>'toSurahNo')::integer;
    v_fa:=coalesce((v_level->>'fromAyah')::integer,1);
    if v_level ? 'toAyah' then
      v_ta:=(v_level->>'toAyah')::integer;
    else
      select max(q.ayah_no)::integer into v_ta from public.quran_ayahs q where q.surah_no=v_ts;
    end if;

    if (
      (v_fs=v_ts and p_surah=v_fs and p_ayah between v_fa and v_ta)
      or
      (v_fs<>v_ts and (
        (p_surah=v_fs and p_ayah>=v_fa)
        or (p_surah=v_ts and p_ayah<=v_ta)
        or (p_surah<v_fs and p_surah>v_ts)
      ))
    ) then
      return v_level;
    end if;
  end loop;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION private.quran_methodology_line_chunks(p_start_surah integer, p_start_ayah integer, p_methodology_code text, p_path text DEFAULT NULL::text, p_profile text DEFAULT NULL::text)
 RETURNS TABLE(day_seq integer, level_key text, target_lines integer, actual_lines integer, from_index integer, to_index integer, from_page integer, to_page integer, from_line integer, to_line integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_level jsonb;
  v_level_id text;
  v_prev_level text:=null;
  v_day_in_level integer:=0;
  v_pattern jsonb;
  v_pattern_len integer;
  v_target integer;
  v_cursor integer:=1;
  v_n integer;
  v_candidate integer;
  v_cum integer;
  v_prev_cum integer;
  v_add integer;
  v_chosen integer;
  v_chosen_lines integer;
  v_day integer:=0;
  v_first record;
  v_cur record;
  v_prev record;
  v_end_s integer;
  v_end_a integer;
  v_level_end_seq integer;
begin
  if p_methodology_code not in ('bir_alwalidayn','aqom') then
    raise exception 'المنهج غير مدعوم.';
  end if;
  if p_methodology_code='aqom' and coalesce(p_path,'') not in ('path1','path2') then
    raise exception 'اختر المسار الأول أو الثاني في برنامج أقوم.';
  end if;

  create temporary table if not exists _method_seq(
    seq integer primary key,
    ayah_index integer not null,
    surah_no integer not null,
    ayah_no integer not null,
    page_no integer not null,
    line_start integer not null,
    line_end integer not null,
    line_start_seq integer not null,
    line_end_seq integer not null
  ) on commit drop;
  truncate _method_seq;

  insert into _method_seq
  with line_catalog as (
    select distinct q.page_no::integer page_no,ln::integer line_no
    from public.quran_ayahs q
    cross join lateral generate_series(q.line_start::integer,q.line_end::integer) ln
  ),
  numbered as (
    select page_no,line_no,row_number() over(order by page_no,line_no)::integer line_seq
    from line_catalog
  )
  select row_number() over(order by -q.surah_no,q.ayah_no)::integer,
         q.ayah_index,q.surah_no::integer,q.ayah_no::integer,q.page_no::integer,
         q.line_start::integer,q.line_end::integer,
         s.line_seq,e.line_seq
  from public.quran_ayahs q
  join numbered s on s.page_no=q.page_no and s.line_no=q.line_start
  join numbered e on e.page_no=q.page_no and e.line_no=q.line_end
  where q.surah_no<p_start_surah
     or (q.surah_no=p_start_surah and q.ayah_no>=p_start_ayah)
  order by -q.surah_no,q.ayah_no;

  select count(*) into v_n from _method_seq;
  if v_n=0 then raise exception 'تعذر بناء تسلسل الحفظ.'; end if;

  while v_cursor<=v_n loop
    select * into v_first from _method_seq where seq=v_cursor;
    v_level:=private.methodology_level_for_position(
      p_methodology_code,p_path,v_first.surah_no,v_first.ayah_no
    );
    exit when v_level is null;

    v_level_id:=v_level->>'id';
    if v_level_id is distinct from v_prev_level then
      v_day_in_level:=1;
      v_prev_level:=v_level_id;
    else
      v_day_in_level:=v_day_in_level+1;
    end if;

    if p_methodology_code='bir_alwalidayn' then
      v_pattern:=coalesce(
        v_level->'targetPattern',
        jsonb_build_array((v_level->>'targetLines')::integer)
      );
      v_pattern_len:=jsonb_array_length(v_pattern);
      v_target:=(v_pattern->>((v_day_in_level-1)%greatest(v_pattern_len,1)))::integer;
    else
      if p_profile is null or not (v_level->'profiles' ? p_profile) then
        raise exception 'مستوى الطالب غير متاح في هذا المسار.';
      end if;
      v_target:=(v_level->'profiles'->>p_profile)::integer;
    end if;

    v_end_s:=(v_level->>'toSurahNo')::integer;
    if v_level ? 'toAyah' then
      v_end_a:=(v_level->>'toAyah')::integer;
    else
      select max(q.ayah_no)::integer into v_end_a
      from public.quran_ayahs q where q.surah_no=v_end_s;
    end if;

    select seq into v_level_end_seq
    from _method_seq
    where surah_no=v_end_s and ayah_no=v_end_a;
    if v_level_end_seq is null then v_level_end_seq:=v_n; end if;

    v_candidate:=v_cursor;
    v_prev_cum:=null;
    v_cum:=0;

    loop
      select * into v_cur from _method_seq where seq=v_candidate;

      if v_candidate=v_cursor then
        v_add:=v_cur.line_end_seq-v_cur.line_start_seq+1;
      else
        select * into v_prev from _method_seq where seq=v_candidate-1;
        if v_prev.surah_no=v_cur.surah_no then
          v_add:=greatest(v_cur.line_end_seq-v_prev.line_end_seq,0);
        else
          v_add:=v_cur.line_end_seq-v_cur.line_start_seq+1;
        end if;
      end if;

      v_cum:=v_cum+v_add;

      if v_candidate=v_cursor and v_cum>=v_target then
        -- الآية الواحدة لا تُقسّم، ولو تجاوزت وحدها مقدار اليوم.
        v_chosen:=v_candidate;
        v_chosen_lines:=v_cum;
        exit;
      elsif v_cum=v_target then
        v_chosen:=v_candidate;
        v_chosen_lines:=v_cum;
        exit;
      elsif v_cum>v_target then
        -- لا نضيف آية جديدة إذا كانت ستتجاوز المقدار اليومي.
        v_chosen:=v_candidate-1;
        v_chosen_lines:=v_prev_cum;
        exit;
      elsif v_candidate>=v_level_end_seq or v_candidate>=v_n then
        v_chosen:=v_candidate;
        v_chosen_lines:=v_cum;
        exit;
      end if;

      v_prev_cum:=v_cum;
      v_candidate:=v_candidate+1;
    end loop;

    select * into v_cur from _method_seq where seq=v_chosen;

    v_day:=v_day+1;
    day_seq:=v_day;
    level_key:=v_level_id;
    target_lines:=v_target;
    actual_lines:=v_chosen_lines;
    from_index:=v_first.ayah_index;
    to_index:=v_cur.ayah_index;
    from_page:=v_first.page_no;
    to_page:=v_cur.page_no;
    from_line:=v_first.line_start;
    to_line:=v_cur.line_end;
    return next;

    v_cursor:=v_chosen+1;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION private.recent_review_window(p_end_index integer, p_unit plan_unit, p_amount integer)
 RETURNS TABLE(start_index integer, end_index integer, actual_amount integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lesson_end public.quran_ayahs%rowtype;
  v_start integer;
  v_finish integer;
  v_last_page integer;
  v_last_surah integer;
begin
  if p_end_index is null or p_amount is null or p_amount<1 then return; end if;
  select * into v_lesson_end from public.quran_ayahs where ayah_index=p_end_index limit 1;
  if not found then return; end if;

  -- المراجعة الصغرى تبدأ من موضع نهاية الدرس وتتجه دائمًا نحو الناس.
  v_start:=p_end_index;

  if p_unit::text='ayahs' then
    v_finish:=least(6236,p_end_index+p_amount-1);
    return query select v_start,v_finish,(v_finish-v_start+1);

  elsif p_unit::text='pages' then
    select max(q.page_no)::integer into v_last_page from public.quran_ayahs q;
    v_last_page:=least(v_last_page,v_lesson_end.page_no+p_amount-1);
    select max(q.ayah_index)::integer into v_finish
    from public.quran_ayahs q
    where q.page_no between v_lesson_end.page_no and v_last_page;
    return query
      select v_start,v_finish,
        (select count(distinct q.page_no)::integer
         from public.quran_ayahs q
         where q.ayah_index between v_start and v_finish);

  elsif p_unit::text='surahs' then
    v_last_surah:=least(114,v_lesson_end.surah_no+p_amount-1);
    select max(q.ayah_index)::integer into v_finish
    from public.quran_ayahs q
    where q.surah_no between v_lesson_end.surah_no and v_last_surah;
    return query
      select v_start,v_finish,
        (select count(distinct q.surah_no)::integer
         from public.quran_ayahs q
         where q.ayah_index between v_start and v_finish);
  else
    raise exception 'المراجعة الصغرى تكون بالآيات أو الصفحات أو السور فقط.';
  end if;
end;
$function$;
CREATE TRIGGER display_label BEFORE INSERT OR UPDATE ON plan_days FOR EACH ROW EXECUTE FUNCTION private.populate_plan_day_display_label();

CREATE TABLE public.students(id text primary key); INSERT INTO public.students VALUES('student');
CREATE SCHEMA cron; CREATE TABLE cron.job(jobname text primary key,active boolean); INSERT INTO cron.job VALUES('sanabil-plan-horizon-refill',true);

CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job VALUES($1,true) ON CONFLICT(jobname) DO UPDATE SET active=true RETURNING 1::bigint $$;
