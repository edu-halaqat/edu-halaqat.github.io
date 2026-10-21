'use strict';
/* Service worker regression: immutable query revisions, fresh versions, unversioned
   network-first behaviour, explicit network benchmarking, and Supabase exclusion. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const handlers={},stored=new Map();
let networkCalls=0;
const urlOf=k=>typeof k==='string'?k:k.url;
const cache={
 async match(k){return stored.get(urlOf(k))||null},
 async put(k,value){stored.set(urlOf(k),value)}
};
const response=tag=>({tag,ok:true,type:'basic',clone(){return this}});
const mock={
 self:{location:{origin:'https://snabilalwahy.com'},addEventListener(name,fn){handlers[name]=fn}},
 caches:{open:async()=>cache},
 fetch:async req=>{networkCalls++;return response('network:'+urlOf(req))},
 URL,Promise,Response:{error:()=>response('failed')},
 console, indexedDB:{open(){throw Error('unexpected indexedDB access')}}
};
vm.runInNewContext(fs.readFileSync('sanabil-offline-sw.js','utf8'),mock,{filename:'sanabil-offline-sw.js'});
assert.equal(typeof handlers.fetch,'function','worker fetch handler must exist');
function req(url,{method='GET',mode='cors',benchmark=false}={}){
 return {url:'https://snabilalwahy.com'+url,method,mode,headers:{get(k){return benchmark&&k==='X-Sanabil-Benchmark'?'1':null}}};
}
async function run(request){
 let responsePromise=null;
 handlers.fetch({request,respondWith(p){responsePromise=Promise.resolve(p)}});
 return responsePromise?await responsePromise:null;
}
(async()=>{
 const old=req('/sanabil-live-v12.js?v=20261022-mobilecache1');
 stored.set(old.url,response('revision-cache'));
 assert.equal((await run(old)).tag,'revision-cache');
 assert.equal(networkCalls,0,'cached versioned script should never make foreground network wait');
 const revised=req('/sanabil-live-v12.js?v=20261023-newbuild');
 assert.match((await run(revised)).tag,/network:/);
 assert.equal(networkCalls,1,'a changed release URL must download new assets');
 assert.equal((await run(revised)).tag,'network:'+revised.url);
 assert.equal(networkCalls,1,'newly downloaded revision should immediately cache');
 const raw=req('/sanabil-free-live.js');
 stored.set(raw.url,response('old'));
 assert.match((await run(raw)).tag,/network:/,'unversioned files stay network-first');
 assert.equal(networkCalls,2);
 const special=req('/sanabil-live-v12.js?v=20261022-mobilecache1',{benchmark:true});
 assert.equal(await run(special),null,'a browser network test must bypass service worker interception');
 const remote={url:'https://fvzoogbdezueswyihxiz.supabase.co/rest/v1/students',method:'GET',mode:'cors',headers:{get(){return null}}};
 assert.equal(await run(remote),null,'cross-origin Supabase never intercepted');
 const write=req('/rest/v1/rpc/save_daily_outcomes_guarded',{method:'POST'});
 assert.equal(await run(write),null,'writes never intercepted by worker');
 console.log('PASS: versioned JS cache-first, new revision busting, unversioned network-first, benchmark bypass, Supabase bypass, POST safety');
})().catch(e=>{console.error(e);process.exitCode=1});
