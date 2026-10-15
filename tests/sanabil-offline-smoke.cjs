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
 console.log('PASS: durable queue, retries, user isolation, snapshot, whitelisting, attendance pending-review');
})().catch(e=>{console.error(e);process.exitCode=1});
