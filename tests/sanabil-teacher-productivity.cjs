'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(f,'utf8');
const js=read('sanabil-teacher-productivity.js');
const live=read('sanabil-live-v12.js'),ops=read('sanabil-live-ops.js'),html=read('index.html');
const sql=read('supabase/migrations/20261019140000_teacher_click_efficiency.sql');
new vm.Script(js,{filename:'sanabil-teacher-productivity.js'});
new vm.Script(ops,{filename:'sanabil-live-ops.js'});
assert(live.includes('SanabilTeacherProductivity?.mount'), 'dashboard mounts teacher controls');
assert(!js.includes('nextStudent')&&!js.includes('autoNext')&&!js.includes('studentIndex++'),'never jump to another student');
assert(js.includes("studentNames:")===false,'student names not stored by metrics');
assert(sql.includes('private.can_access')&&sql.includes('auth.uid()'),'efficiency requires scoped auth');
assert(!sql.includes('student_id')&&!sql.includes('student_name')&&!sql.includes('notes'),'metrics never persist student data');
assert(sql.includes('greatest(public.circle_efficiency_sessions.clicks,excluded.clicks)'),'retries idempotent');
assert(html.includes('/sanabil-teacher-productivity.js?v=20261019-v1'));
assert(ops.includes('circle_efficiency_sessions')&&ops.includes('نقرة/حصيلة'));
class E {
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};this.className='';this.textContent='';this.dataset={};this.isConnected=true;this.value='';this.disabled=false;this.hidden=false;}
 append(...els){for(const x of els){this.children.push(x);x.parentNode=this}}
 prepend(x){this.children.unshift(x);x.parentNode=this}
 replaceChildren(...els){this.children=[];this.append(...els)}
 insertBefore(item,before){const i=this.children.indexOf(before);if(i<0)this.append(item);else {this.children.splice(i,0,item);item.parentNode=this}}
 after(item){this.parentNode?.insertBefore(item,this.parentNode.children[this.parentNode.children.indexOf(this)+1])}
 addEventListener(type,fn){this.events[type]=fn}
 removeEventListener(type,fn){if(this.events[type]===fn)delete this.events[type]}
 setAttribute(k,v){this.attributes[k]=v}
 contains(element){return element===this||this.children.some(x=>x.contains(element))}
 closest(sel){return null}
 querySelector(sel){
   if(sel==='.sl-quick-list')return this.children.find(x=>x.className==='sl-quick-list')||null;
   if(sel==='.sl-quick-notice')return this.children.find(x=>x.className==='sl-quick-notice')||null;
   if(sel==='.sl-quick-outcomes')return this.children.find(x=>x.className==='sl-quick-outcomes')||null;
   if(sel==='input')return this.children.find(x=>x.tag==='input')||null;
   if(sel==='[data-action="save-attendance"]')return this.attendance||null;
   return null;
 }
 querySelectorAll(sel){return []}
 click(){this.events.click?.()}
 focus(){this.focused=true}
 showModal(){this.open=true}
 close(){this.open=false;this.events.close?.()}
 remove(){this.isConnected=false}
}
const storage=()=>{const db=new Map();return{getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)}};
const localStorage=storage(),sessionStorage=storage(),eventBus={};
const document={
 body:new E('body'),
 createElement:tag=>new E(tag),
 addEventListener:(name,fn)=>eventBus[name]=fn,
 removeEventListener:(name,fn)=>{if(eventBus[name]===fn)delete eventBus[name]}
};
const box=new E('div'),quick=new E('section'),list=new E('div'),notice=new E('p');
quick.className='sl-quick-outcomes';list.className='sl-quick-list';notice.className='sl-quick-notice';
quick.append(list,notice);box.append(quick);
const called={grade:0,details:[],day:0,att:0};
box._sanabilQuick={openBulkGrade:()=>called.grade++,openBulkDay:()=>called.day++,
 openDetails:i=>called.details.push(i),selectedIndices:()=>[6],
 studentNames:()=>['الأول','السابع','الثامن عشر']};
box.attendance=new E('button');box.attendance.events.click=()=>called.att++;
const network=[];
const window={addEventListener:(type,fn)=>eventBus['window_'+type]=fn,
 removeEventListener:(type,fn)=>{if(eventBus['window_'+type]===fn)delete eventBus['window_'+type]},
 supabaseClient:{rpc:(method,args)=>{network.push({method,args});return Promise.resolve({data:{ok:true},error:null})}}};
const env={window,document,localStorage,sessionStorage,performance:{now:()=>1000},navigator:{onLine:true},
 crypto:{randomUUID:()=>'11111111-1111-4111-8111-111111111111'},setTimeout:()=>1,clearTimeout:()=>{},Event:class Event{}};
vm.runInNewContext(js,env);
const api=window.SanabilTeacherProductivity;
assert(api.validFavorites(['search','bulk_grade','bulk_day']));
assert(!api.validFavorites(['search','search','bulk_day']));
assert.equal(api.normalize('أَحْمَد'), 'احمد');
const m=api.mount({box,circle:'circle1',date:'2026-10-19',teacherId:'teacher1'});
assert(m,'one session mounts');
assert.equal(quick.children.filter(x=>x.className==='sl-quick-favorites').length,1,'three favorites visible');
const toolbar=quick.children.find(x=>x.className==='sl-quick-favorites');
const favorites=toolbar.children.find(x=>x.className==='sl-quick-favorite-actions');
assert.equal(favorites.children.length,3);
assert.deepEqual(favorites.children.map(x=>x.textContent),['بحث عن طالب','تقييم مجموعة','تصنيف يوم مجموعة']);
m.runAction('details');assert.deepEqual(called.details,[6],'selection chooses arbitrary student in existing order');
m.runAction('bulk_grade');m.runAction('bulk_day');m.runAction('attendance_save');
assert.equal(called.grade,1);assert.equal(called.day,1);assert.equal(called.att,1);
const inside={closest:sel=>sel.includes('.sl-quick-perfect'),tag:'button'};
box.contains=()=>true;
eventBus.click({isTrusted:true,target:inside});
assert.equal(m.summary().clicks,1,'one trusted tap counts once');
assert.equal(m.summary().categories.grade,1,'tap categorized by action');
eventBus.click({isTrusted:false,target:inside});
assert.equal(m.summary().clicks,1,'synthetic/programmatic click not double counted');
m.flush();assert.equal(network[0].method,'record_circle_efficiency_guarded');
assert.equal(network[0].args.p_clicks,1);
assert.equal(network[0].args.p_categories.grade,1);
assert(!Object.keys(network[0].args).some(k=>k.includes('student')),'no student ID in uploaded metrics');
console.log('PASS: teacher-selected favorites, arbitrary student order, honest tap count, scoped RPC, and no student PII');
