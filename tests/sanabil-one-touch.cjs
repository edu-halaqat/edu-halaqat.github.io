'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=n=>fs.readFileSync(n,'utf8');
const live=read('sanabil-live-v12.js'),quick=read('sanabil-quick-outcomes.js'),ops=read('sanabil-live-ops.js');
const html=read('index.html'),css=read('sanabil-quick-outcomes.css'),
 sql=read('supabase/migrations/20261019081000_atomic_bulk_day_types.sql'),
 metrics=read('supabase/migrations/20261019083000_circle_operation_metrics.sql');
for(const [name,source] of [['live',live],['quick',quick],['ops',ops]])new vm.Script(source,{filename:name+'.js'});
assert(html.includes('/sanabil-quick-outcomes.js?v=20261023-detail1'));
assert(html.includes('/sanabil-live-ops.js?v=20261023-arabic1'));
assert(html.includes('/sanabil-live-ops.css?v=20261019-v1'));
assert(live.includes("attendance:s.attendanceStatus||(needsDayAttendance(activeKind(s.studentId))?'present':'')"),'unrecorded attendance presented as present');
assert(!live.includes("attendance:s.attendanceStatus||'',"),'no unset attendance by default');
assert(live.includes("await rpc('set_day_types_bulk_guarded'"),'batch day type uses guarded server operation');
assert(live.includes("autoPending=new Set()")&&live.includes('const saveOneStudent=async(i,{defer=false}={})=>'),'autosave reuses server-verified save routine');
assert(live.includes('await saveOneStudent(i,{defer:true})')&&live.includes("window.addEventListener('sanabil-offline-confirmed',onConfirmed)"),'autosave stages durable writes and confirms after acknowledgement');
assert(live.includes("box._sanabilQuick?.isProvisional?.(i)"),'do not automatically save invented recitation grades');
assert(live.includes("if(!drafts[students[i].studentId])continue"),'do not re-save rows without changes');
assert(live.includes('const i=[...autoPending].find(index=>!autoInFlight.has(index))'),'do not drop edits during in-flight saves');
assert(live.includes("await confirmSaved(s,x)"),'server readback required before marking confirmed');
assert(quick.indexOf('const targetIndices')<quick.indexOf('const seedPresent'),'bulk operations remain in parent scope');
assert(quick.includes("openBulkDay")&&quick.includes("openBulkGrade"),'batch UI for day types and grade');
assert(quick.includes('sl-quick-attendance')&&quick.includes('غائب بعذر')&&quick.includes('مستأذن'),'attendance exceptions visible in fast mode');
assert(live.includes('changeAttendance:(i,value)=>')&&live.includes('syncCard(i);persistDraft(i);'),'attendance selector shares guarded autosave path');
assert(quick.includes("if(!readOnly&&sessionDate)seedPresent(false)"),'initial perfect ratings remain local drafts');
assert(quick.includes("isProvisional:i=>provisional.has(i)"),'autowrite gate for unverified grades');
assert(sql.includes('public.set_day_type_guarded(')&&sql.includes('security invoker'),'reuse existing permissions and plan change constraints');
assert(metrics.includes('duration_ms')&&!metrics.includes('student_id'),'latency records contain no student identifiers');
const w={};vm.runInNewContext(quick,{window:w,document:{}});
const grade=w.SanabilQuickOutcomes.gradeFor;
assert.equal(grade('memorization',0,1),'لم يحفظ');
assert.equal(grade('recentReview',0,1),'لم يحفظ');
assert.equal(grade('review:a',2,2),'لم يحفظ');
assert.equal(grade('review:a',0,2),'جيد جدًا');
const opsWindow={};vm.runInNewContext(ops,{window:opsWindow,document:{},navigator:{onLine:false}});
const p=opsWindow.SanabilLiveOps.percentile;
assert.equal(p([100,200,300,400,500],.95),500);
assert.equal(p([],0.95),null);
// Regression: an autosave attempt writes a durable draft but MUST NOT
// schedule itself again; only an actual teacher edit may enqueue another write.
{
 const first=live.indexOf('const persistDraft=(i,{schedule=true}={})=>{');
 const end=live.indexOf('const clearDraft=i=>',first);
 assert(first>=0&&end>first,'explicit scheduling option must exist');
 const expression=live.slice(first,end);
 let writes=0,timers=0,issues=0;
 const student=[{studentId:'s1'}],drafts={};
 const saveStatus={textContent:'',dataset:{}};
 const factory=new Function('students','rowData','drafts','saveDrafts','box','normalizedMetrics',
   'saveErrors','scheduleOutcomeAutoSave','updateOutcomeIssues',
   expression+'\nreturn persistDraft;');
 const persist=factory(student,()=>({
    att:'present',absenceReason:'',note:'',ratings:{memorization:'جيد جدًا',reviewPlans:{}},metrics:{}
   }),drafts,()=>writes++,{querySelector:()=>saveStatus},x=>x,new Map(),
   ()=>timers++,()=>issues++);
 persist(0,{schedule:false});
 assert.equal(writes,1,'autosave must durably write the draft');
 assert.equal(timers,0,'no self-requeue after attempting save');
 assert.equal(issues,1,'UI must reflect the draft immediately');
 persist(0);
 assert.equal(timers,1,'a later user edit is still scheduled');
}
assert(live.includes("if(status?.dataset.saved==='queued'){queued.push(s.fullName);continue}"),
 'submit cannot enqueue a duplicate of an unacknowledged offline write');
assert(live.includes('studentSaves.set(i,pending)'),'same student writes are serialized');
console.log('PASS: default attendance is nonpersisted, autosave gates unverified grades, atomic group actions, live metric confidentiality, and strict Quran scoring');
