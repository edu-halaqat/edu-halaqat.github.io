'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const edge=fs.readFileSync('supabase/functions/sanabil-attendance/index.ts','utf8');
const fast=fs.readFileSync('sanabil-teacher-fast-path.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(edge.includes('confirmedLate=Number(record.late_minutes??0)'),'saved original late minutes are authoritative');
assert(edge.includes('if(data?.attendanceId)attendanceLookup=attendanceLookup.eq("id",data.attendanceId)'),'duplicates linked to actual attendance');
assert(edge.includes('if(!data?.duplicate)'),'duplicate never overwrites original row');
assert(edge.includes('confirmedCheckInAt=record.check_in_at'),'original check-in timestamp included');
assert(fast.includes("STATUS='sanabil_fast_fingerprint_v2:'"),'bad previous-day browser cache is not restored');
assert(fast.includes('confirmedCheckInAt:data?.confirmedCheckInAt||null'),'client displays original confirmed check-in');
assert(html.includes('sanabil-teacher-fast-path.js?v=20261030-workspace'),'new client is cache-busted');
const start=edge.indexOf('    const patch:any={updated_at:new Date().toISOString()};');
const end=edge.indexOf('\n  }catch(e){',start);
assert(start>=0&&end>start,'live response logic extractable');
const responseBlock=edge.slice(start,end)
 .replace('const patch:any=', 'const patch=')
 .replace('confirmedCheckInAt:string|null','confirmedCheckInAt');
const evaluate=vm.runInNewContext(
 '(async ({admin,data,action,late,earlyArrival,earlyLeave,user,circle,prayer,info,reply})=>{'+responseBlock+'})');
const run=async ({duplicate,serverLate,firstLate,withId=true})=>{
 let writes=0,reads=0;
 const saved={check_in_at:'2026-10-27T12:27:47.000Z',late_minutes:firstLate,early_arrival_minutes:0};
 const q={eq(){return this;},select(){return this;},update(){writes++;return this;},
  maybeSingle:async()=>{reads++;return{data:saved,error:null}},
  then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject)}};
 const result=await evaluate({
  admin:{from:()=>q},data:{duplicate,dateKey:'2026-10-27',...(withId?{attendanceId:'original'}:{})},
  action:'checkIn',late:serverLate,earlyArrival:0,earlyLeave:undefined,
  user:{id:'teacher'},circle:{id:'circle'},prayer:{dateKey:'2026-10-27'},
  info:{prayerStart:'15:21',lateUntil:'15:36'},reply:value=>value
 });
 return{result,writes,reads};
};
(async()=>{
 const original=await run({duplicate:false,serverLate:0,firstLate:0});
 assert.equal(original.result.lateMinutes,0);
 assert.equal(original.writes,1);
 const retry=await run({duplicate:true,serverLate:22,firstLate:0});
 assert.equal(retry.result.lateMinutes,0,'15:58 retry cannot change a 15:27 on-time check-in');
 assert.equal(retry.writes,0,'duplicate never changes official attendance');
 assert.equal(retry.result.confirmedCheckInAt,'2026-10-27T12:27:47.000Z');
 const delayed=await run({duplicate:true,serverLate:50,firstLate:7,withId:false});
 assert.equal(delayed.result.lateMinutes,7,'legitimate lateness survives duplicate requests');
 assert.equal(delayed.reads,1);
 console.log('PASS: first check-in authoritative; retry cannot fabricate 22 late minutes; legitimate late remains intact');
})().catch(e=>{console.error(e);process.exitCode=1});
