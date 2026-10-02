'use strict';
const DB='sanabil-offline-v1',STORE='queue';
const NOOR_SOURCE='https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/noor-bayan-book';
const NOOR_CACHE='sanabil-noor-bayan-v1';
const NOOR_KEY='/noor-bayan.pdf';
let noorCaching=null;
async function cacheNoorBook(){
  if(noorCaching)return noorCaching;
  noorCaching=(async()=>{
    try{
      const cache=await caches.open(NOOR_CACHE);
      const exists=await cache.match(NOOR_KEY);
      if(exists)return true;
      const r=await fetch(NOOR_SOURCE,{mode:'cors',cache:'force-cache'});
      if(!r.ok)throw new Error('book-fetch');
      await cache.put(NOOR_KEY,r.clone());
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of clients)client.postMessage({type:'sanabil-noor-cached'});
      return true;
    }catch{return false}
    finally{noorCaching=null}
  })();
  return noorCaching;
}
const openDb=()=>new Promise((ok,fail)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
const withStore=(mode,fn)=>openDb().then(db=>new Promise((ok,fail)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);fn(s);t.oncomplete=()=>ok();t.onerror=()=>fail(t.error)}));
const put=x=>withStore('readwrite',s=>s.put(x));
const del=id=>withStore('readwrite',s=>s.delete(id));
const all=()=>openDb().then(db=>new Promise((ok,fail)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>fail(r.error)}));
async function flush(){for(const x of await all()){try{const r=await fetch(x.url,{method:'POST',headers:x.headers,body:JSON.stringify(x.body)});if(r.ok){await del(x.id);const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage({type:'sanabil-offline-synced',id:x.id})}else if([401,403,408,429].includes(r.status)||r.status>=500)break;else await del(x.id)}catch{break}}}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='queue'&&d.item)e.waitUntil((async()=>{await put(d.item);try{await self.registration.sync.register('sanabil-sync')}catch{}await flush()})());if(d.type==='flush')e.waitUntil(flush());if(d.type==='ack'&&d.id)e.waitUntil(del(d.id));if(d.type==='CACHE_NOOR_BAYAN')e.waitUntil(cacheNoorBook())});
self.addEventListener('sync',e=>{if(e.tag==='sanabil-sync')e.waitUntil(flush())});

self.addEventListener('fetch',e=>{
  try{
    const u=new URL(e.request.url);
    if(u.origin===self.location.origin&&u.pathname===NOOR_KEY){
      e.respondWith((async()=>{
        const cache=await caches.open(NOOR_CACHE);
        const hit=await cache.match(NOOR_KEY);
        if(hit)return hit;
        const r=await fetch(NOOR_SOURCE,{mode:'cors',cache:'force-cache'});
        if(r.ok)await cache.put(NOOR_KEY,r.clone());
        return r;
      })());
    }
  }catch{}
});