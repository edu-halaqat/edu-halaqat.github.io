'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const offline=fs.readFileSync('sanabil-offline-app.js','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const start=offline.indexOf('async function hasFreshSnapshot('),end=offline.indexOf('async function readThrough(',start);
assert(start>=0&&end>start);
let uid='user-a',saved,seen;
const context={userId:async()=>uid,SNAP:'snapshots',get:async(store,key)=>{seen=key;return saved},Date,Number,Object};
vm.createContext(context);vm.runInContext(offline.slice(start,end),context);
(async()=>{
 const fresh=context.hasFreshSnapshot;
 assert.equal(await fresh('rpc:test',300000),false);
 saved={userId:uid,capturedAt:new Date().toISOString(),value:[]};
 assert.equal(await fresh('rpc:test',300000),true);assert.equal(seen,'user-a:rpc:test');
 saved.capturedAt=new Date(Date.now()-300001).toISOString();assert.equal(await fresh('rpc:test',300000),false);
 saved.capturedAt=new Date(Date.now()+60000).toISOString();assert.equal(await fresh('rpc:test',300000),false);
 saved.capturedAt='invalid';assert.equal(await fresh('rpc:test',300000),false);
 saved.capturedAt=new Date().toISOString();uid='user-b';assert.equal(await fresh('rpc:test',300000),false);
 assert.equal(seen,'user-b:rpc:test');assert.equal(await fresh('rpc:test',NaN),false);
 context.get=async()=>{throw Error('storage unavailable')};assert.equal(await fresh('rpc:test',300000),false);
 const a=live.indexOf('for(const [name,args] of operations){'),b=live.indexOf('\n    if(!force)await',a);
 assert(a>=0&&b>a);
 const run=async(force,manualCircle,isFresh)=>{
  const calls=[],checks=[],scope={force,manualCircle,operations:[['circle_session_access',{}],['get_day_types_guarded',{}],['get_daily_assignments',{}]],done:[],
   rpc:async name=>calls.push(name),window:{SanabilOffline:{hasFreshSnapshot:async(key,age)=>{checks.push({key,age});return isFresh}}}};
  vm.createContext(scope);await vm.runInContext('(async()=>{'+live.slice(a,b)+'})()',scope);
  assert.equal(scope.done.length,3);return {calls,checks};
 };
 let result=await run(false,'',true);assert.deepEqual(result.calls,['circle_session_access']);assert.equal(result.checks.length,2);
 result=await run(false,'',false);assert.equal(result.calls.length,3);
 result=await run(true,'',true);assert.equal(result.calls.length,3);assert.equal(result.checks.length,0);
 result=await run(false,'circle',true);assert.equal(result.calls.length,3);assert.equal(result.checks.length,0);
 console.log('PASS: fresh background snapshots, account isolation, expired/future/missing/unavailable snapshots, live authorization, forced/manual refresh');
})().catch(e=>{console.error(e);process.exitCode=1});
