'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let appends=0,shouldFail=false;
const window={};
const head={appendChild(script){
 appends++;
 queueMicrotask(()=>{
  if(shouldFail){script.onerror?.();return;}
  window.SanabilDeepPerformance={run:async()=>({ok:true})};
  script.onload?.();
 });
}};
const ctx={window,document:{createElement(){return {}},head,documentElement:head},Map,Promise,Error,Boolean,console,queueMicrotask};
vm.runInNewContext(fs.readFileSync('sanabil-lazy.js','utf8'),ctx);
(async()=>{
 assert.equal(appends,0,'diagnostics should not download on initial page');
 assert.equal(typeof window.SanabilLazy?.loadDeepPerformance,'function');
 const [a,b]=await Promise.all([window.SanabilLazy.loadDeepPerformance(),window.SanabilLazy.loadDeepPerformance()]);
 assert.equal(a,true);assert.equal(b,true);assert.equal(appends,1,'concurrent requests must share one script download');
 await window.SanabilLazy.loadDeepPerformance();assert.equal(appends,1);
 delete window.SanabilDeepPerformance;
 shouldFail=true;
 await assert.rejects(()=>window.SanabilLazy.loadDeepPerformance(),/تعذر تحميل/);
 shouldFail=false;
 await window.SanabilLazy.loadDeepPerformance();
 assert.equal(appends,3,'a failed network load should be safely retryable');
 console.log('PASS: diagnostics downloaded only on demand, deduplicated concurrently, retry after failure');
})().catch(e=>{console.error(e);process.exitCode=1});
