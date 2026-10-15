'use strict';
// Synthetic anonymous Supabase Realtime signaling, without real pupil data.
const {createClient}=require('@supabase/supabase-js');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const url='https://fvzoogbdezueswyihxiz.supabase.co';
const key='sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ';
const A=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const B=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const topic='sanabil-trial-ci:'+randomUUID();
const a=A.channel(topic,{config:{broadcast:{self:false}}});
const b=B.channel(topic,{config:{broadcast:{self:false}}});
function join(channel,label){return new Promise((resolve,reject)=>{
 const t=setTimeout(()=>reject(Error(label+' timed out joining')),20000);
 channel.subscribe((status,err)=>{if(status==='SUBSCRIBED'){clearTimeout(t);resolve()}
 else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(t);reject(Error(label+': '+(err?.message||status)))}})
})}
(async()=>{
 try{
  const received=new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Synthetic WebRTC offer was not received')),20000);
   b.on('broadcast',{event:'signal'},event=>{if(event.payload?.trial==='synthetic'){clearTimeout(timeout);resolve(event.payload)}})
  });
  await Promise.all([join(a,'teacher'),join(b,'student')]);
  const result=await a.send({type:'broadcast',event:'signal',payload:{trial:'synthetic',kind:'offer',to:'ci-student'}});
  assert.equal(result,'ok','Broadcast did not return ok');
  const msg=await received;
  assert.equal(msg.to,'ci-student');
  console.log('PASS: anonymous signaling over one random temporary channel');
 }finally{
  await Promise.allSettled([A.removeChannel(a),B.removeChannel(b)]);
  await Promise.allSettled([A.realtime.disconnect(),B.realtime.disconnect()]);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
