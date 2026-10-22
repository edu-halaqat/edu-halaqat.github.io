'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('sanabil-quick-outcomes.js','utf8'),live=fs.readFileSync('sanabil-live-v12.js','utf8'),
html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('sanabil-quick-outcomes.css','utf8');
new vm.Script(js,{filename:'sanabil-quick-outcomes.js'});
assert(html.includes('/sanabil-quick-outcomes.js?v=20261022-savefix3'));
assert(html.includes('/sanabil-quick-outcomes.css?v=20261019-v8'));
assert(live.includes('window.SanabilQuickOutcomes?.mount?.({'),'live classroom loads optional quick editor');
assert(live.includes('sl-savebar-feedback'),'failed outcome saves must show a visible footer-level error');
assert(live.includes('<form class="sl-outcome-session" novalidate>'),
 'daily outcome form must bypass silent browser-native validation of hidden editor fields');
assert(!/name="(?:fromAyah|toAyah)"[^>]* required>/.test(live),
 'hidden Quran-range controls must never stop bulk outcome submit before JS validation');
assert(live.includes('const input=name=>Number(panel.querySelector'),
 'explicit Quran range editor retains its own input validation');
assert(live.includes("rpcOffline('save_daily_outcomes_guarded'"),'existing server-guarded outcome pipeline preserved');
assert(live.includes('for(const {s,x} of normal)await confirmSaved'),'server confirmation preserved');
assert(css.includes('.sl-quick-sheet')&&css.includes('.sl-quick-mode'),'responsive views available');
const win={};vm.runInNewContext(js,{window:win,document:{}});const grade=win.SanabilQuickOutcomes.gradeFor;
for(const [key,e,d,want] of [
 ['memorization',0,0,'ممتاز'],['memorization',0,1,'لم يحفظ'],
 ['memorization',0,3,'لم يحفظ'],['memorization',1,0,'لم يحفظ'],['memorization',1,1,'لم يحفظ'],
 ['recentReview',0,0,'ممتاز'],['recentReview',0,1,'لم يحفظ'],['recentReview',1,0,'لم يحفظ'],
 ['review:a',0,0,'ممتاز'],['review:a',0,1,'ممتاز'],
 ['review:a',1,0,'جيد جدًا'],['review:a',0,2,'جيد جدًا'],
 ['review:a',1,1,'جيد'],['review:a',2,0,'جيد'],
 ['review:a',2,1,'جيد'],['review:a',0,5,'جيد'],
 ['review:a',3,0,'لم يحفظ'],['review:a',0,6,'لم يحفظ'],
 ['review:a',1,4,'لم يحفظ'],['review:a',2,2,'لم يحفظ']
])assert.equal(grade(key,e,d),want,[key,e,d].join('|'));
class E{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.events={};this.className='';this.attributes={};this.style={};this.isConnected=true;this.disabled=false;this.value='';this.textContent='';this.dataset={};this.classList={add:c=>this.className+=' '+c,toggle:c=>{if(this.className.includes(c)){this.className=this.className.replace(c,'').trim();return false}this.className+=' '+c;return true}}}
 append(...els){this.children.push(...els);els.forEach(el=>el.parentNode=this)}
 replaceChildren(...els){this.children=[];this.append(...els)}
 remove(){this.isConnected=false}
 setAttribute(a,b){this.attributes[a]=b}
 addEventListener(a,b){this.events[a]=b}
 click(){this.events.click?.()}
 querySelector(selector){
  if(selector==='.sl-quick-outcomes')return null;
  if(selector.startsWith('[data-save-status="'))return {dataset:{saved:''},textContent:'غير محفوظ'};
  return null;
 }
}
const doc={body:new E('body'),createElement(tag){return new E(tag,this)}},box=new E('div',doc),form=new E('form',doc);
form.parentNode={insertBefore(child){box.quick=child}};
const student={fullName:'طالب تجريبي',memorization:{},recentReview:{},reviews:[{planId:'p1',planName:'مراجعة كبرى 1'},{planId:'p2',planName:'مراجعة كبرى 2'}],studentId:'student-1'};
let updates=0,saves=0;
const grades={},counts={};
const state={attendance:'present',ratings:{memorization:'',recentReview:''},reviewPlans:{}};
const ctx={box,form,students:[student],states:[state],readOnly:false,activeKind:()=> 'study',needsDayAttendance:()=>true,
 gradeValue:(s,key)=>key.startsWith('review:')?s.reviewPlans[key.slice(7)]||'':s.ratings[key]||'',
 setGrade:(s,key,value)=>{if(key.startsWith('review:'))s.reviewPlans[key.slice(7)]=value;else s.ratings[key]=value},
 metricFor:(i,key)=>counts[key]||(counts[key]={errors:0,doubts:0,tajweed:0}),
 setMetric:(i,key,field,value)=>{counts[key]??={errors:0,doubts:0,tajweed:0};counts[key][field]=value},
 persistDraft:()=>saves++,syncCard:()=>updates++};
const env={window:{confirm:()=>true},document:doc};
vm.runInNewContext(js,env);
const app=env.window.SanabilQuickOutcomes.mount(ctx);
assert(app&&box.quick,'quick list mounted');
assert.equal(state.ratings.memorization,'','mere presence must not silently credit recitation');
assert.equal(app.seed(true),1,'explicit seed prepares provisional excellent for a present student');
assert.equal(state.ratings.memorization,'ممتاز','provisional defaults must be excellent');
let prevented=false;
env.window.confirm=()=>false;
form.events.submit({preventDefault(){prevented=true},stopImmediatePropagation(){}});
assert(prevented,'form submission is blocked when teacher declines to affirm recitation');
env.window.confirm=()=>true;
form.events.submit({preventDefault(){throw Error('unexpected cancel')},stopImmediatePropagation(){}});
const list=box.quick.children.find(el=>el.className==='sl-quick-list');
const row=list.children[0],actions=row.children[2];
const perfect=actions.children[1];perfect.click();
assert.equal(state.ratings.memorization,'ممتاز');
assert.equal(state.ratings.recentReview,'ممتاز');
assert.equal(state.reviewPlans.p1,'ممتاز');
assert.equal(state.reviewPlans.p2,'ممتاز');
assert(saves>0&&updates>0,'one tap creates a draft via existing program functions');
const before=JSON.stringify(counts);
ctx.states[0].attendance='absent';
app.refresh(0);
assert.equal(perfect.disabled,true,'absent student cannot receive quick excellent');
assert.equal(JSON.stringify(counts),before,'changing attendance does not forge counters');
assert.equal(grade('review:p1',1,4),'لم يحفظ','two doubt equivalents for each error');
console.log('PASS: fast Quran grading, daily-session integration, one-tap excellent, per-plan ratings, excluded absences, and guarded existing persistence');
