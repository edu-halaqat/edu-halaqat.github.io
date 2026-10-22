'use strict';
// 100 simultaneous READ-ONLY simulated visitors from one Actions runner.
// This is NOT authentication with 100 user accounts and NOT a Supabase write test.
const fs=require('node:fs');
const base='https://snabilalwahy.com';
const USERS=100,TIMEOUT_MS=20000;
const values=[],failures=[];
const pct=(sorted,percent)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*percent)-1)]:null;
const run=async id=>{
 const start=performance.now();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 try{
  const headers={'Cache-Control':'no-cache','Accept':'text/html,*/*;q=0.8','X-Sanabil-Synthetic-Test':'readonly-100'};
  const home=await fetch(base+'/index.html?peak100='+id+'-'+Date.now(),{headers,signal:controller.signal,redirect:'follow'});
  if(!home.ok)throw Error('صفحة الدخول: '+home.status);
  const html=await home.text();
  if(!html.includes('sanabil-live-v12.js'))throw Error('لم يظهر رابط التطبيق');
  const m=html.match(/src="(\/sanabil-live-v12\.js\?v=[^"]+)"/);
  if(!m)throw Error('رابط تطبيق غير محدد');
  const app=await fetch(base+m[1],{headers:{'Cache-Control':'no-cache'},signal:controller.signal});
  if(!app.ok)throw Error('ملف التطبيق: '+app.status);
  const js=await app.text();
  if(!js.includes('window.__SanabilLiveBuild='))throw Error('لم يتأكد تحميل ملف التطبيق');
  values.push({user:id,ms:Math.round(performance.now()-start),homeStatus:home.status,appStatus:app.status,bytes:Buffer.byteLength(html)+Buffer.byteLength(js)});
 }catch(e){failures.push({user:id,message:String(e?.message||e).slice(0,180),elapsedMs:Math.round(performance.now()-start)})}
 finally{clearTimeout(timer)}
};
(async()=>{
 // One gate: all 100 virtual clients start their first HTTP request at once.
 let release;const gate=new Promise(resolve=>{release=resolve});
 const workers=Array.from({length:USERS},(_,i)=>(async()=>{await gate;await run(i+1)})());
 const startedAt=new Date().toISOString(),t0=performance.now();
 release();await Promise.all(workers);
 const sorted=values.map(x=>x.ms).sort((a,b)=>a-b),elapsedMs=Math.round(performance.now()-t0);
 const report={
  description:'محاكاة 100 زائر متزامن لتنزيل صفحة التطبيق وملفه الرئيسي؛ دون تسجيل دخول ودون كتابة لقاعدة البيانات',
  testType:'public-read-only',authenticatedUsers:0,syntheticUsers:USERS,
  startedAt,finishedAt:new Date().toISOString(),elapsedMs,
  completed:values.length,failures:failures.length,
  p50Ms:pct(sorted,.5),p95Ms:pct(sorted,.95),p99Ms:pct(sorted,.99),
  maxMs:sorted.at(-1)||null,totalBytes:values.reduce((sum,x)=>sum+x.bytes,0),
  failureDetails:failures.slice(0,30),
  limitation:'لا يحاكي ضغط مئة معلم مسجل الدخول ولا حفظ الحصائل المتزامن، ويعتمد على شبكة مشغل الاختبار وحدها.'
 };
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync('artifacts/peak100-readonly.json',JSON.stringify(report,null,2));
 console.log('=== اختبار مئة زائر متزامن، قراءة فقط ===');
 console.log(JSON.stringify(report,null,2));
 process.exitCode=failures.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1});
