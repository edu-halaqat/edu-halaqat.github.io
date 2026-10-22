'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {indexedDB}=require('fake-indexeddb'),{randomUUID}=require('node:crypto');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const listeners=new Map(),timers=new Map();let timerId=0;
const window={indexedDB,addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(fn)},
 removeEventListener(k,fn){listeners.set(k,(listeners.get(k)||[]).filter(x=>x!==fn))},
 dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e)}};
const localStorage=storage(),sessionStorage=storage(),navigator={onLine:true};
const document={head:{appendChild(){}},body:null,documentElement:{dataset:{}},addEventListener(){},createElement(){return {style:{}}}};
let fail=false;const requests=[];
window.supabaseClient={auth:{async getSession(){return {data:{session:{user:{id:'teacher'}}}}}},
 async rpc(name,args){requests.push({name,args});if(fail)return {error:{message:'Failed to fetch'}};
  if(name==='apply_offline_operations_batch')return {data:{results:args.p_operations.map(x=>({id:x.id,ok:true,result:{ok:true}}))}};
  return {data:{ok:true,saved:args.p_rows?.length||0}};
 }};
const ctx={window,document,navigator,localStorage,sessionStorage,indexedDB,crypto:{randomUUID},console,
 CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail}},Event:class{constructor(type){this.type=type}},
 setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout(id){timers.delete(id)},queueMicrotask,
 Date,JSON,Set,Map,Promise,Error,String,Number,Array,Object,Math,performance};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('sanabil-offline-app.js','utf8'),ctx);
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const prefix=live.slice(0,live.indexOf('const sessionCache='));
vm.runInContext(prefix+'\nglobalThis.testApi={rpcOffline,flushOfflineQueue};})();',ctx);
(async()=>{
 const api=ctx.testApi,offline=window.SanabilOffline;
 await api.rpcOffline('save_daily_outcomes_guarded',{p_rows:[{studentId:'one'}]},'one',{defer:true});
 await api.rpcOffline('save_daily_outcomes_guarded',{p_rows:[{studentId:'two'}]},'two',{defer:true});
 assert.equal(requests.length,0,'autosave must first persist on the device');
 assert.equal(await offline.count(),2);
 assert.equal(timers.size,1,'edits share one timer, no timer reset starvation');
 const scheduled=[...timers.values()][0];assert(scheduled.delay>=46000&&scheduled.delay<=55000);
 const explicit=await api.rpcOffline('save_daily_outcomes_guarded',{p_rows:[{studentId:'final'}]},'manual');
 assert.equal(explicit.queued,true,'manual save must become a durable queued write when older edits exist');
 assert.equal(requests.length,0,'manual save must not wait for slow older writes');
 assert.equal(await offline.count(),3,'older edits and new explicit save all remain queued in order');
 assert.equal(timers.size,1,'manual save should accelerate, rather than duplicate, the sync timer');
 assert([...timers.values()].every(x=>x.delay>=2200&&x.delay<=11201),'manual save uses short jitter');
 await api.flushOfflineQueue();
 assert.deepEqual(requests.map(x=>x.name),Array(3).fill('apply_offline_operations_batch'),
   'queued operations must upload in original order without overtaking the older draft');
 assert.deepEqual(requests.map(x=>x.args.p_operations[0].payload.p_rows[0].studentId),['one','two','final']);
 assert.equal(await offline.count(),0);
 assert.equal(timers.size,0,'completed sync cancels the pending timer');
 await api.rpcOffline('save_daily_outcomes_guarded',{p_rows:[{studentId:'network'}]},'network',{defer:true});
 fail=true;
 const newer=await api.rpcOffline('save_daily_outcomes_guarded',{p_rows:[{studentId:'newer'}]},'newer');
 assert.equal(newer.queued,true,'a failed earlier request must not freeze newer manual saves');
 assert.equal(await offline.count(),2,'both versions remain durable');
 await api.flushOfflineQueue();
 assert.equal(await offline.count(),2,'failed upload must never erase either queued write');
 assert.equal(requests.at(-1).name,'apply_offline_operations_batch','newer edit never bypasses a rejected older version');
 assert([...timers.values()].some(x=>x.delay>=91000),'network retries use backoff');
 fail=false;await api.flushOfflineQueue();assert.equal(await offline.count(),0);
 // An acknowledgement/readback for an older edit cannot clear or relabel a newer draft.
 const start=live.indexOf('      const onConfirmed=async event=>{');
 const end=live.indexOf("      window.addEventListener('sanabil-offline-confirmed',onConfirmed);",start);
 let finishRead,cleared=0;
 const status={dataset:{operationId:'old',saved:'queued'},textContent:''};
 const draft={version:1};
 const handler=vm.runInNewContext('(()=>{'+live.slice(start,end)+'return onConfirmed})()',{
  window,form:{isConnected:true},r:{operationId:'old'},status,
  confirmSaved:()=>new Promise(resolve=>{finishRead=resolve}),
  drafts:{student:draft},s:{studentId:'student'},x:{},i:0,before:JSON.stringify(draft),
  clearDraft(){cleared++},console,JSON
 });
 const checking=handler({detail:{id:'old'}});
 await new Promise(resolve=>setImmediate(resolve));
 status.dataset.operationId='new';status.dataset.saved='draft';finishRead();await checking;
 assert.equal(cleared,0);assert.equal(status.dataset.saved,'draft','older asynchronous readback must not mark a newer version saved');
 status.dataset.operationId='old';
 const confirming=handler({detail:{id:'old'}});
 await new Promise(resolve=>setImmediate(resolve));finishRead();await confirming;
 assert.equal(cleared,1);assert.equal(status.dataset.saved,'saved');
 console.log('PASS: durable staged autosave, nonblocking manual queue, strict operation ordering, jitter, backoff and failed-save retention');
})().catch(e=>{console.error(e);process.exitCode=1});
