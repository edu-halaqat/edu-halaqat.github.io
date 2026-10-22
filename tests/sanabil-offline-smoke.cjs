'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
const storage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const localStorage=storage(),sessionStorage=storage(),listeners={};
const window={indexedDB,localStorage,sessionStorage,addEventListener(k,fn){(listeners[k]??=[]).push(fn)},dispatchEvent(){},matchMedia(){return{matches:false}}};
const document={head:{appendChild(){}},body:null,addEventListener(){},createElement(){return{style:{},append(){},setAttribute(){}}}};
const navigator={onLine:false,serviceWorker:null};
const ctx={window,document,navigator,indexedDB,IDBKeyRange,localStorage,sessionStorage,crypto:{randomUUID},
   CustomEvent:class{constructor(name,{detail}={}){this.type=name;this.detail=detail}},Event:class{constructor(type){this.type=type}},console,
   confirm:()=>true,alert:()=>{},Date,JSON,Set,Map,Promise,Error,String,Number,Array,Object,queueMicrotask};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('sanabil-offline-app.js','utf8'),ctx,{filename:'sanabil-offline-app.js'});
const api=window.SanabilOffline;
(async()=>{
 localStorage.setItem('sanabil-auth-session-v2',JSON.stringify({user_id:'user-A'}));
 assert.equal(await api.userId(),'user-A');
 const first=await api.queue('save_daily_outcomes_guarded',{p_date:'2026-10-15',p_rows:[{studentId:'test-student'}]},'test');
 assert.equal(first.queued,true);
 assert.equal(await api.count(),1);
 // Never delete on server failure.
 navigator.onLine=true;
 await api.flush(async()=>{throw Error('server-rejected')});
 assert.equal(await api.count(),1,'rejected write must remain on device');
 let transmitted=0;
 await api.flush(async(name,args)=>{transmitted++;assert.equal(name,'apply_offline_operation');assert.equal(args.p_operation_id,first.operationId);return {ok:true}});
 assert.equal(await api.count(),0,'confirmed write must leave local queue');
 assert.equal(transmitted,1);
 const a=await api.readThrough('schedule',async()=>({day:'Thursday'}));
 assert.equal(a.day,'Thursday');
 navigator.onLine=false;
 const b=await api.readThrough('schedule',async()=>{throw Error('must not be called offline')});
 assert.equal(b.day,'Thursday');
 await api.queue('save_student_attendance_guarded',{p_circle_id:'test-circle',p_date:'2026-10-15',p_rows:[]},'test');
 localStorage.setItem('sanabil-auth-session-v2',JSON.stringify({user_id:'user-B'}));
 assert.equal(await api.count(),0,'no cross-user queue access');
 await assert.rejects(()=>api.readThrough('schedule',async()=>({})),/لا توجد نسخة محلية/);
 localStorage.setItem('sanabil-auth-session-v2',JSON.stringify({user_id:'user-A'}));
 assert.equal(await api.count(),1);
 await assert.rejects(()=>api.queue('delete_everything',{},'bad'),/لم يُجهّز/);
 navigator.onLine=true;
 const evidence=await api.queue('submit_offline_attendance_claim',{p_circle_id:'c',p_mosque_id:'m',p_kind:'checkIn',p_captured_at:'2026-10-15T10:00:00Z',p_lat:24,p_lng:39,p_accuracy:14},'fingerprint');
 await api.flush(async(name,args)=>name==='submit_offline_attendance_claim'?{status:'pending_review'}:{ok:true});
 assert.equal(await api.count(),0);
 // Simultaneous readers share only the in-flight request, never a stale TTL.
 let readCalls=0,release;
 const gate=new Promise(resolve=>{release=resolve});
 const load=async()=>{readCalls++;await gate;return {version:1}};
 const readers=[api.readThrough('same-session',load),api.readThrough('same-session',load)];
 await new Promise(resolve=>setImmediate(resolve));release();
 assert.deepEqual(await Promise.all(readers),[{version:1},{version:1}]);
 assert.equal(readCalls,1,'parallel loads must make one server request');
 assert.equal((await api.readThrough('same-session',async()=>({version:2}))).version,2,'next read must be fresh');
 await assert.rejects(()=>api.readThrough('read-failure',async()=>{throw Error('denied')}),/denied/);
 assert.equal(await api.readThrough('read-failure',async()=>7),7,'failed reads must not poison future reads');
 // Keep user partitions even while a request is still running.
 let releaseA;
 const userA=api.readThrough('partition',async()=>{await new Promise(resolve=>{releaseA=resolve});return 'A'});
 await new Promise(resolve=>setImmediate(resolve));
 localStorage.setItem('sanabil-auth-session-v2',JSON.stringify({user_id:'user-B'}));
 assert.equal(await api.readThrough('partition',async()=>'B'),'B');
 releaseA();assert.equal(await userA,'A');
 localStorage.setItem('sanabil-auth-session-v2',JSON.stringify({user_id:'user-A'}));
 // More than one batch; fingerprint claims retain their dedicated endpoint.
 for(let i=0;i<25;i++)await api.queue('save_daily_outcomes_guarded',{p_date:'2026-10-15',p_rows:[{studentId:'batch-'+i}]},'batch');
 let batchCalls=0;
 const acceptBatch=async(name,args)=>{
  assert.equal(name,'apply_offline_operations_batch');batchCalls++;
  assert(args.p_operations.length<=5);
  return {results:args.p_operations.map(x=>({id:x.id,ok:true,result:{ok:true}}))};
 };
 await Promise.all([api.flush(acceptBatch,{batch:true}),api.flush(acceptBatch,{batch:true})]);
 assert.equal(batchCalls,5,'25 operations need five requests, concurrent flush must not duplicate');
 assert.equal(await api.count(),0);
 const queued=[];
 for(let i=0;i<3;i++)queued.push(await api.queue('save_daily_outcomes_guarded',{p_rows:[{studentId:'partial-'+i}]},'partial'));
 await api.flush(async(name,args)=>({results:[
  {id:args.p_operations[0].id,ok:true,result:{ok:true}},
  {id:args.p_operations[1].id,ok:false,error:{message:'permission-denied'}}
 ]}),{batch:true});
 assert.equal(await api.count(),2,'only confirmed prefix may leave the device');
 await api.flush(async(name,args)=>{
  assert.equal(args.p_operations[0].id,queued[1].operationId,'retry keeps original operation identity');
  return acceptBatch(name,args);
 },{batch:true});
 assert.equal(await api.count(),0);
 // Simulate a lost HTTP response after the server applied the operation.
 const lost=await api.queue('save_daily_outcomes_guarded',{p_rows:[]},'lost-response');
 await api.flush(async()=>{throw Error('Failed to fetch')},{batch:true});
 assert.equal(await api.count(),1);
 await api.flush(async(name,args)=>{
  assert.equal(args.p_operations[0].id,lost.operationId);
  return {results:[{id:lost.operationId,ok:true,result:{ok:true,alreadyApplied:true}}]};
 },{batch:true});
 const invalid=await api.queue('save_daily_outcomes_guarded',{p_rows:[]},'invalid-ack');
 await api.flush(async()=>({results:[{id:'wrong-id',ok:true,result:{ok:true}}]}),{batch:true});
 assert.equal(await api.count(),1,'mismatched confirmation must not drop data');
 await api.flush(acceptBatch,{batch:true});
 await api.queue('save_daily_outcomes_guarded',{p_rows:[]},'before-fingerprint');
 await api.queue('submit_offline_attendance_claim',{p_circle_id:'c'},'fingerprint');
 await api.queue('save_daily_outcomes_guarded',{p_rows:[]},'after-fingerprint');
 const endpoints=[];
 await api.flush(async(name,args)=>{endpoints.push(name);return name==='submit_offline_attendance_claim'?{status:'pending_review'}:acceptBatch(name,args)},{batch:true});
 assert.deepEqual(endpoints,['apply_offline_operations_batch','submit_offline_attendance_claim','apply_offline_operations_batch']);
 assert.equal(await api.count(),0);
 // Production-sized one-operation transactions preserve order and await each acknowledgement.
 const one=[];for(let i=0;i<3;i++)one.push(await api.queue('save_daily_outcomes_guarded',{p_rows:[{studentId:'one-'+i}]},'one'));
 const seq=[];
 await api.flush(async(name,args)=>{
  assert.equal(name,'apply_offline_operations_batch');
  assert.equal(args.p_operations.length,1,'production flush must use one operation per transaction');
  seq.push(args.p_operations[0].id);
  return {results:[{id:args.p_operations[0].id,ok:true,result:{ok:true}}]};
 },{batch:true,maxBatchSize:1});
 assert.deepEqual(seq,one.map(o=>o.operationId),'single-operation batches must preserve edit order');
 assert.equal(await api.count(),0);
 // If a later item fails after the first is confirmed, retry by the later ID.
 {
  const first=await api.queue('save_daily_outcomes_guarded',{p_rows:[{studentId:'retry-first'}]},'first');
  const second=await api.queue('save_daily_outcomes_guarded',{p_rows:[{studentId:'retry-second'}]},'second');
  const third=await api.queue('save_daily_outcomes_guarded',{p_rows:[{studentId:'retry-third'}]},'third');
  const singles=[];
  let batches=0,received=[];
  await api.flush(async(name,args)=>{
   if(name==='apply_offline_operations_batch'){
    batches++;
    received=args.p_operations.map(x=>x.id);
    return {results:[
     {id:first.operationId,ok:true,result:{ok:true}},
     {id:second.operationId,ok:false,error:{code:'57014',message:'statement timeout'}}
    ]};
   }
   assert.equal(name,'apply_offline_operation');
   singles.push(args.p_operation_id);
   return {ok:true};
  },{batch:true,maxBatchSize:3});
  assert.equal(batches,1);
  assert.deepEqual(received,[first.operationId,second.operationId,third.operationId],
   'batch order differs: '+JSON.stringify(await api.status(true)));
  assert.deepEqual(singles,[second.operationId,third.operationId],
   'never replay a confirmed prefix item after a later timeout');
  assert.equal(await api.count(),0);
 }
 console.log('PASS: concurrent fresh reads, user isolation, bounded batches, partial failures, lost responses, acknowledgement validation, ordered fingerprint boundary');
 console.log('PASS: durable queue, retries, user isolation, snapshot, whitelisting, attendance pending-review');
})().catch(e=>{console.error(e);process.exitCode=1});
