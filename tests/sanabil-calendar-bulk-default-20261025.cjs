'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const calendar=fs.readFileSync('sanabil-plan-calendar.js','utf8');
const migrations=fs.readFileSync('supabase/migrations/20261025054500_calendar_defaults_bulk_override.sql','utf8');
const fixes=fs.readFileSync('supabase/migrations/20261025055500_reflow_derived_reviews_calendar.sql','utf8');
const page=fs.readFileSync('index.html','utf8');
new vm.Script(calendar);
assert(page.includes('sanabil-plan-calendar.js?v=20261025-bulk-default1'));
assert(page.includes('sanabil-build" content="20261030-v13.8.75"'));
assert(calendar.includes("multiple:'أيام متفرقة بالضغط على التقويم'"));
assert(calendar.includes("range:'فترة بين تاريخين'"));
assert(calendar.includes("weeks:'أسابيع متتالية'"));
assert(calendar.includes("addDays(weekStart,weekCount*7)"));
assert(calendar.includes("addDays(iso(year,month,1)"));
assert(calendar.includes("p_day_type:newType"));
assert(calendar.includes("p_circle_ids:circlesBatch,p_dates:group"));
assert(calendar.includes("d+=7")&&calendar.includes("c+=10"),'client bounds each transaction to <=70 circle-days');
assert(calendar.includes("type.onchange=()=>{selectedType=type.value;selectedTypeTouched=true}"),
 'classification must survive re-rendering when selecting multiple dates');
assert(calendar.includes("default:'العودة للتقويم الافتراضي'"));
assert(calendar.includes("إجازة تلقائية · "), 'calendar distinguishes official defaults');
assert(calendar.includes("تعديل المشرف: "),'calendar distinguishes explicit overrides');
assert(!calendar.includes("client.rpc('approve_calendar_day_fast_guarded'"),'old single-day restriction removed');
assert(migrations.includes("CREATE TABLE IF NOT EXISTS private.academic_calendar_default_days"));
assert(migrations.includes("date '2026-10-25'"));
assert(migrations.includes("date '2027-04-30', date '2027-05-22'"));
assert(!migrations.includes("date '2027-07-"),'summer holidays intentionally not seeded');
assert(migrations.includes("private.effective_day_type(p_student_id text,p_date date)"));
assert(migrations.includes("FROM public.student_day_types")&&migrations.includes("FROM public.circle_day_types"),
 'student and supervisor overrides take precedence over official default');
assert(migrations.includes("'default'"),'default can be restored by deleting explicit override');
assert(migrations.includes("DELETE FROM public.circle_day_types"),'reset physically removes override');
assert(migrations.includes("REVOKE ALL ON FUNCTION public.apply_calendar_days_bulk_guarded"),'anonymous callers excluded');
assert(migrations.includes("private.can_access(v_circle.org_id,v_circle.complex_id"),'authorize each circle');
assert(migrations.includes("p_dates date[]"),'batch date input typed');
assert(migrations.includes("private.effective_day_type(s.id,d.date_key)<>'study'"),'queue only for currently excluded days');
assert(migrations.includes("IF private.effective_day_type(task.student_id,task.date_key)=''study''"),'old pending jobs must not shift newly restored school days');
assert(migrations.includes("JOIN public.memberships m")===false,'avoid any user-selection shortcut in queue');
assert(migrations.includes("FROM public.memberships m JOIN public.profiles prof"),'automatic queue uses scoped active manager, never an arbitrary user');
assert(fixes.includes('private.rebuild_qpc_major_review_against_recent'));
assert(fixes.includes('private.rebuild_recent_review_plan'));
class FakeNode{
 constructor(tag){this.tagName=String(tag).toLowerCase();this.children=[];this.style={};this.textContent='';this.attributes={};this.className='';
  this.classList={add:(...names)=>{this.className=[this.className,...names].join(' ')}};
 }
 append(...xs){this.children.push(...xs)}
 replaceChildren(...xs){this.children=[...xs]}
 setAttribute(k,v){this.attributes[k]=String(v)}
 addEventListener(t,fn){this['on'+t]=fn}
 showModal(){this.open=true}
 close(){this.open=false;this.onclose?.()}
 remove(){this.removed=true}
}
const body=new FakeNode('body'),head=new FakeNode('head');
const document={body,head,createElement:tag=>new FakeNode(tag),getElementById:()=>null};
const now='2026-10-25T12:00:00Z';
class FixedDate extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return Date.parse(now)}}
const rpcCalls=[];
const client={rpc:async(name,args)=>{
 rpcCalls.push({name,args});
 if(name==='get_calendar_management_scope_guarded')
  return {data:[{id:'complex-a',name:'مجمع أول',circles:[{id:'circle-a',name:'حلقة أولى'},{id:'circle-b',name:'حلقة ثانية'}]}],error:null};
 if(name==='get_circle_day_types_range_guarded')return {data:[],error:null};
 if(name==='apply_calendar_days_bulk_guarded')
  return {data:{ok:true,days:args.p_dates.length,circles:args.p_circle_ids.length,queuedStudents:0},error:null};
 if(name==='get_calendar_reflow_status_guarded')return {data:[],error:null};
 throw Error('unexpected RPC '+name);
}};
const window={supabaseClient:client,confirm:()=>true};
vm.runInNewContext(calendar,{window,document,console,Intl,Date:FixedDate},{timeout:1500});
const flatten=node=>[node,...node.children.flatMap(flatten)];
const findLabel=label=>flatten(body).find(x=>x.tagName==='label'&&x.textContent===label);
const findButton=label=>flatten(body).find(x=>x.tagName==='button'&&x.textContent===label);
const findSelect=value=>flatten(body).find(x=>x.tagName==='select'&&x.children.some(o=>o.value===value));
(async()=>{
 await window.SanabilPlanCalendar.open({selectedCircle:'circle-a'});
 let mode=findSelect('weeks');
 assert(mode,'week mode selector exists');
 mode.value='weeks';mode.onchange();
 let start=findLabel('بداية الأسابيع').children.find(x=>x.tagName==='input');
 start.value='2026-11-20';start.onchange();
 let number=findLabel('عدد الأسابيع').children.find(x=>x.tagName==='input');
 number.value='2';number.onchange();
 await findButton('اعتماد الأيام المحددة').onclick();
 let batches=rpcCalls.filter(x=>x.name==='apply_calendar_days_bulk_guarded');
 assert.equal(batches.length,2,'two weekly chunks, one confirmation');
 assert.equal(batches[0].args.p_dates.length,7);
 assert.equal(batches[1].args.p_dates.length,7);
 assert.equal(batches[0].args.p_dates[0],'2026-11-20');
 assert.equal(batches[1].args.p_dates.at(-1),'2026-12-03');
 assert.equal(batches[0].args.p_circle_ids.length,1);
 const type=findSelect('default');
 type.value='default';type.onchange();
 await findButton('اعتماد الأيام المحددة').onclick();
 batches=rpcCalls.filter(x=>x.name==='apply_calendar_days_bulk_guarded');
 assert.equal(batches.length,4);
 assert.equal(batches[2].args.p_day_type,'default','restores official classification');
 mode=findSelect('multiple');mode.value='multiple';mode.onchange();
 assert(findButton('تحديد الشهر'),'calendar month can be chosen with one tap');
 findButton('تحديد الشهر').onclick();
 assert(flatten(body).some(x=>String(x.textContent).includes('الأيام المختارة: ٣١')||String(x.textContent).includes('الأيام المختارة: 31')),
  'entire current month selected');
 console.log('PASS: verified official defaults, bulk weeks, two bounded transactions, override reset, month selection, rights and safe queue');
})().catch(e=>{console.error(e);process.exitCode=1});
