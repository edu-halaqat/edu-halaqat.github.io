'use strict';
const {createClient}=require('@supabase/supabase-js');
const {webcrypto,randomUUID}=require('node:crypto');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={window:{},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Date,Set,JSON,btoa,atob};
vm.runInNewContext(fs.readFileSync('sanabil-video-crypto.js','utf8'),sandbox);
const C=sandbox.window.SanabilVideoCrypto;
const url='https://fvzoogbdezueswyihxiz.supabase.co',publishable='sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const A=createClient(url,publishable,options),B=createClient(url,publishable,options);
const room='ci-'+randomUUID(),a=A.channel('sanabil-video:'+room,{config:{broadcast:{self:false}}}),b=B.channel('sanabil-video:'+room,{config:{broadcast:{self:false}}});
function join(channel){return new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('Realtime subscription timeout')),20000);
 channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timeout);resolve()}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timeout);reject(Error(status))}});
})}
(async()=>{try{
 const key=await C.importKey(C.random());
 const received=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Encrypted signaling not received')),20000);
  b.on('broadcast',{event:'signal'},async event=>{
   const payload=await C.unpack(key,room,'signal',event.payload,new Set(),Date.now()+60000);
   if(payload?.kind==='synthetic-offer'){clearTimeout(timeout);resolve(payload)}
  });
 });
 await Promise.all([join(a),join(b)]);
 const result=await a.send({type:'broadcast',event:'signal',payload:await C.pack(key,room,'signal',{kind:'synthetic-offer',to:'synthetic-student'})});
 assert.equal(result,'ok');assert.equal((await received).to,'synthetic-student');
 console.log('PASS: encrypted signaling through live Supabase between two synthetic clients; no real pupil/media used');
}finally{await Promise.allSettled([A.removeChannel(a),B.removeChannel(b)]);A.realtime.disconnect();B.realtime.disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
