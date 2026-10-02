'use strict';
const DB='sanabil-offline-v1',STORE='queue';
const openDb=()=>new Promise((ok,fail)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
const withStore=(mode,fn)=>openDb().then(db=>new Promise((ok,fail)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);fn(s);t.oncomplete=()=>ok();t.onerror=()=>fail(t.error)}));
const put=x=>withStore('readwrite',s=>s.put(x));
const del=id=>withStore('readwrite',s=>s.delete(id));
const all=()=>openDb().then(db=>new Promise((ok,fail)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>fail(r.error)}));
async function flush(){for(const x of await all()){try{const r=await fetch(x.url,{method:'POST',headers:x.headers,body:JSON.stringify(x.body)});if(r.ok){await del(x.id);const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage({type:'sanabil-offline-synced',id:x.id})}else if([401,403,408,429].includes(r.status)||r.status>=500)break;else await del(x.id)}catch{break}}}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='queue'&&d.item)e.waitUntil((async()=>{await put(d.item);try{await self.registration.sync.register('sanabil-sync')}catch{}await flush()})());if(d.type==='flush')e.waitUntil(flush());if(d.type==='ack'&&d.id)e.waitUntil(del(d.id))});
self.addEventListener('sync',e=>{if(e.tag==='sanabil-sync')e.waitUntil(flush())});
