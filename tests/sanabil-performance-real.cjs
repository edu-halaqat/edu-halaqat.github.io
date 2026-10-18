'use strict';
/* Regression: operational timings are gathered only from genuine classroom actions. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const perf=fs.readFileSync('sanabil-performance.js','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
assert(live.includes("afterPaintActual('open'"),'session open must wait for rendered cards');
assert(live.includes("afterPaintActual('switch'"),'teacher navigation must record actual paint');
assert(live.includes("data-real-next")&&live.includes("data-real-prev"),'card navigation controls present');
assert(live.includes("recordActual('save_student'"),'single save instrumentation present');
for(const stage of ['save_student_access','save_student_write','save_student_verify']){
 assert(live.includes("recordActual('"+stage+"'"),'missing operational save stage '+stage);
}
assert(live.indexOf("recordActual('save_student_write'")<live.indexOf("const verifyStarted=performance.now()"),'database write measured before verification');
assert(live.indexOf("recordActual('save_student_verify'")>live.indexOf("await confirmSaved(s,x)"),'verification timing recorded only after completed readback');
assert(live.includes("recordActual('save_all'"),'bulk save instrumentation present');
assert(live.includes("recordActual('save_talaqqin'"),'talaqqin save instrumentation present');
assert(live.indexOf("recordActual('save_student'")>live.indexOf('if(unchanged)'), 'single saves recorded after confirmation and draft comparison');
assert(live.indexOf("recordActual('save_all'")>live.indexOf('if(modified)'), 'bulk saves only after all confirmations');
assert(live.indexOf("recordActual('save_talaqqin'")>live.indexOf('if(!confirmed?.length'),'talaqqin saves only after verification');
assert(live.includes("data-real-results"),'real-world report has dedicated view');
assert(live.includes('لا تُنشأ بيانات طلاب للتجربة'), 'real-save test must not invent student data');
const store=new Map();const storage={
 getItem:key=>store.get(key)||null,
 setItem:(key,val)=>store.set(key,String(val)),
 removeItem:key=>store.delete(key)
};
const build=()=>{
 const listeners={};
 const window={addEventListener:(name,cb)=>(listeners[name]??=[]).push(cb),dispatchEvent:()=>{}};
 const document={visibilityState:'visible'};
 let time=5;
 const performance={now:()=>time};
 const ready=[];
 const context={window,document,sessionStorage:storage,performance,
  requestAnimationFrame:callback=>{ready.push(callback);return ready.length},
  CustomEvent:class{constructor(name){this.type=name}},
  setTimeout,clearTimeout,AbortController,Promise,console};
 vm.runInNewContext(perf,context);
 return {api:window.SanabilPerformance,document,ready,advance:ms=>time+=ms};
};
const r=build();const api=r.api;
assert.equal(api.actualSummary().find(v=>v.kind==='open').count,0);
for(let n=1;n<=20;n++)api.recordActual('open',n*100);
const open=api.actualSummary().find(v=>v.kind==='open');
assert.equal(open.count,20);
assert.equal(open.mean,1050);
assert.equal(open.p95,1900,'nearest-rank 95th percentile');
assert.equal(open.under2s,95);
assert.equal(open.max,2000);
api.recordActual('save_student',NaN);api.recordActual('save_student',-1);
assert.equal(api.actualSummary().find(v=>v.kind==='save_student').count,0,'invalid measurements rejected');
api.afterPaintActual('switch',r.advance(200),()=>true);
r.ready.shift()();r.advance(40);r.ready.shift()();
assert.equal(api.actualSummary().find(v=>v.kind==='switch').count,1);
for(const [stage,time] of [['save_student_access',240],['save_student_write',4100],['save_student_verify',620]]){
 api.recordActual(stage,time);
 const row=api.actualSummary().find(x=>x.kind===stage);
 assert.equal(row.count,1,'stage is present for '+stage);
 assert.equal(row.p95,time,'P95 preserves real per-stage durations');
}
const stored=storage.getItem('sanabil-real-timings-v1');
assert(!stored.includes('studentId')&&!stored.includes('fullName')&&!stored.includes('notes'),'no student identifiers or notes persisted');
const second=build();
assert.equal(second.api.actualSummary().find(v=>v.kind==='open').count,20,'reloading tab preserves only anonymized timing values');
second.api.clearActual();
assert.equal(second.api.actualSummary().find(v=>v.kind==='open').count,0);
assert.equal(store.has('sanabil-real-timings-v1'),false);
console.log('PASS: real action timings, P95, privacy, paint visibility, verified save hooks and reset');
