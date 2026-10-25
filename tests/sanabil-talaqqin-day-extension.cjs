'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sanabil-live-v12.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261023_talaqqin_daily_extension.sql','utf8');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sanabil-offline-sw.js','utf8');
new vm.Script(source);
assert(source.includes("button('تمديد الدرس بالأيام','to-extend-'+i)"),'daily card must have day extension action');
assert(source.includes('extendTalaqqinLessonDays(root,r,renderTalaqqin)'),'daily button must open day modal');
assert(source.includes("const extendTalaqqinLessonDays=async(root,row,refresh)=>"),'daily extension modal exists');
assert(source.includes("rpc('extend_talaqqin_lesson_days'"),'daily extension must use new authorized day RPC');
assert(source.includes("[1,2,3,4,5,6,7].map"),'only one to seven days per addition');
assert(source.includes("p_add_days:0,p_note:null"),'teacher can cancel the daily extension');
assert(source.includes("lessonDailyHoldUntil"),'daily card displays existing deadline');
assert(source.includes("lessonDailyExtraDays"),'daily card displays accumulated day count');
assert(source.includes("button('تعديل مدة الخطة بالأسابيع','tl-plan-pace-'+i)"),'weekly pacing remains in Plans');
assert(source.includes("button('زيادة مدة الدرس بالأسابيع','tl-plan-extend-'+i)"),'week-based extension remains separate');
assert(source.includes("rpc('save_talaqqin_pacing'"),'existing week pace update preserved');
assert(!source.includes("if(extend)action(box,extend,()=>extendTalaqqinLesson(root,r,renderTalaqqin))"),
 'daily extension cannot invoke week RPC');
assert(html.includes('sanabil-live-v12.js?v=20261025-month-nav2'),'new scripts bust cache');
assert(html.includes('sanabil-build" content="20261025-v13.8.70"'),'html and js build reflect a new deployment');
assert(source.includes("window.__SanabilLiveBuild='20261025-v13.8.70'"));
assert(sw.includes('sanabil-shell-20261025-v49-month-nav'),'offline script version refreshed');
for(const marker of [
 'create table if not exists public.talaqqin_lesson_day_extensions',
 'revoke all on public.talaqqin_lesson_day_extensions from public,anon,authenticated',
 'create or replace function public.extend_talaqqin_lesson_days(',
 "p_add_days not between 0 and 7",
 "v_until:=greatest(v_existing.hold_until,v_today)+p_add_days",
 "v_total:=v_existing.added_days+p_add_days",
 'lesson_started_on=st.lesson_started_on',
 'e.hold_until>(now() at time zone \'Asia/Riyadh\')::date',
 "private.can_access(v_student.org_id",
 'get_talaqqin_dashboard',
 'save_talaqqin_assessment',
 'update_talaqqin_assessment_guarded',
 'grant execute on function public.extend_talaqqin_lesson_days(text,integer,integer,text) to authenticated'
])assert(sql.includes(marker),'missing database protection '+marker);
assert(!sql.includes('update public.talaqqin_student_unit_pacing'),'day extension cannot rewrite week planning');
assert(!sql.includes('update public.talaqqin_student_lesson_pacing'),'day extension cannot rewrite week extension');
console.log('PASS: daily lesson extension stays 1–7 days and repeatable; passes preserve lesson until deadline; cancel, permissions, weekly plans, cache and readback remain independent');
