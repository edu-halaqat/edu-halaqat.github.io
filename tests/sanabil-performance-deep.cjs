'use strict';
/* Non-destructive extended 20-round performance regression. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('sanabil-performance-deep.js','utf8');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('sanabil-live-v12.js','utf8');
const deploy=fs.readFileSync('.github/workflows/pages.yml','utf8');
assert(html.includes('/sanabil-performance-deep.js?v=20261018-v1'),'module must load');
assert(ui.includes('data-deep>بدء الاختبار الموسع (20 محاولة)'),'20-round UI button present');
assert(ui.includes('data-deep-copy'),'copy report button present');
assert(deploy.includes('node tests/sanabil-performance-deep.cjs'),'deployment guarded by regression');
assert(!/\.rpc\(['"]save_daily_outcomes_guarded['"]/.test(src),'never write real student grades');
assert(!/\.from\(['"](?:outcomes|student_attendance|plan_days)['"]\)\s*\.(?:insert|update|upsert|delete)/.test(src),'no student-record mutations');
const counters={},calls={write:0,reads:0,absences:0}, updates=[];
class E {
 constructor(tag){this.tag=tag;this.hidden=false;this.textContent='';this.children=[]}
 appendChild(node){this.children.push(node);return node}
 setAttribute(){}removeAttribute(){}
}
const document={createElement:tag=>new E(tag),createDocumentFragment:()=>new E('fragment')};
const client={
 rpc(name){
  counters[name]=(counters[name]||0)+1;
  return {abortSignal:async()=>{
   if(name==='sanabil_performance_save_dryrun'){
    calls.write++;return {data:{ok:true,rolledBack:true,mode:'isolated_diagnostic_write'},error:null};
   }
   calls.reads++;
   return {data:name==='get_daily_assignments'?
     [{studentId:'s1',fullName:'test one'},{studentId:'s2',fullName:'test two'}]:
     name==='get_guardian_excuses_for_circle_guarded'?[]:name==='circle_session_access'?{allowed:true}:{defaultType:'study'},
    error:null};
  }}
 },
 from(table){
  assert.equal(table,'student_attendance','read-only attendance query');
  return {select(){return this},eq(){return this},abortSignal:async()=>{calls.absences++;return {data:[],error:null}}};
 }
};
const globalWindow={supabaseClient:client},performance={now:(()=>{let n=0;return()=>n+=13})()};
const navigator={onLine:true,userAgent:'Android',connection:{effectiveType:'4g'}};
const context={window:globalWindow,performance,document,navigator,
 Date,Number,Array,Math,String,Error,DOMException,AbortController,
 setTimeout:fn=>{fn();return 1},clearTimeout:()=>{},Promise,console};
vm.runInNewContext(src,context);
(async()=>{
 const value=await globalWindow.SanabilDeepPerformance.run({circleId:'circle1',date:'2026-10-18',onUpdate:row=>updates.push(row)});
 assert.equal(value.rounds,20);
 assert.equal(value.metrics.open.count,20);
 assert.equal(value.metrics.switch.count,20);
 assert.equal(value.metrics.write.count,20);
 assert.equal(value.metrics.write.errors,0);
 assert.equal(value.metrics.open.p95,26,'nearest-rank P95 values');
 assert.equal(calls.reads,80);
 assert.equal(calls.absences,20);
 assert.equal(calls.write,20);
 assert.equal(updates.length,20);
 assert.equal(value.client.platform,'جوال أو تابلت');
 assert.equal(value.metrics.open.under2s,100);
 const ac=new AbortController();ac.abort();
 const cancelled=await globalWindow.SanabilDeepPerformance.run({circleId:'circle1',date:'2026-10-18',signal:ac.signal});
 assert.equal(cancelled.rounds,0);assert.equal(cancelled.cancelled,true);
 console.log('PASS: 20 live read rounds, 20 rollback-only writes, P95, local student switching, cancellation; no student mutations');
})().catch(error=>{console.error(error);process.exitCode=1});
