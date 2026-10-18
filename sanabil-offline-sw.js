'use strict';
/* Sanabil PWA shell. Never replay private POST requests from the service worker:
   auth tokens expire, 2xx alone does not guarantee domain-level acceptance,
   and only a signed-in foreground page may confirm cloud persistence. */
const SHELL='sanabil-shell-20261018-v15-voice-complete-capture';
const NOOR_SOURCE='https://fvzoogbdezueswyihxiz.supabase.co/functions/v1/noor-bayan-book';
const NOOR_CACHE='sanabil-noor-bayan-v1',NOOR_KEY='/noor-bayan.pdf';
const LEGACY_DB='sanabil-offline-v1',LEGACY_STORE='queue';
const basic=['/index.html','/','/manifest.webmanifest','/assets/logo-sanabil-icon-v6.png','/assets/logo-sanabil-v6.png','/assets/sanabil-app-visible-192.png','/assets/sanabil-app-visible-512.png','/assets/sanabil-app-visible-maskable-512.png','/auth-gate.js','/sanabil-offline-app.js'];
const isAsset=p=>/\.(?:js|css|png|jpe?g|webp|svg|woff2?|ico)(?:$|\?)/i.test(p);
const openLegacy=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(LEGACY_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(LEGACY_STORE))r.result.createObjectStore(LEGACY_STORE,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const legacyDelete=async id=>{const db=await openLegacy();try{await new Promise((resolve,reject)=>{const t=db.transaction(LEGACY_STORE,'readwrite');t.objectStore(LEGACY_STORE).delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}finally{db.close()}};
const legacyPut=async item=>{const db=await openLegacy();try{await new Promise((resolve,reject)=>{const t=db.transaction(LEGACY_STORE,'readwrite');t.objectStore(LEGACY_STORE).put(item);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}finally{db.close()}};
async function warmShell(){
 const cache=await caches.open(SHELL);let paths=[...basic];
 try{
  const response=await fetch('/index.html',{cache:'reload'});
  if(response.ok){await cache.put('/index.html',response.clone());await cache.put('/',response.clone());
   const html=await response.text();
   for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
     const path=match[1];if(path.startsWith('/')&&isAsset(path))paths.push(path);
   }
  }
 }catch{}
 paths=[...new Set(paths)].slice(0,75);
 await Promise.allSettled(paths.map(async path=>{
  if(await cache.match(path))return;
  const response=await fetch(path,{cache:'reload'});
  if(response.ok&&response.type==='basic')await cache.put(path,response);
 }));
}
async function noorBook(){
 const cache=await caches.open(NOOR_CACHE);
 if(await cache.match(NOOR_KEY))return true;
 const response=await fetch(NOOR_SOURCE,{mode:'cors'});
 if(!response.ok)return false;
 await cache.put(NOOR_KEY,response.clone());
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of clients)client.postMessage({type:'sanabil-noor-cached'});
 return true;
}
self.addEventListener('install',event=>event.waitUntil(warmShell().then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith('sanabil-shell-')&&k!==SHELL).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 const data=event.data||{};
 if(data.type==='CACHE_NOOR_BAYAN')event.waitUntil(noorBook().catch(()=>false));
 if(data.type==='ack'&&data.id)event.waitUntil(legacyDelete(data.id).catch(()=>{}));
 // Compatibility with older tabs: retain old submissions but do not replay them
 // with bearer tokens embedded in stored requests. New app migrates local drafts.
 if(data.type==='queue'&&data.item)event.waitUntil(legacyPut(data.item).catch(()=>{}));
 if(data.type==='flush')event.waitUntil(Promise.resolve().then(async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'sanabil-offline-flush-request'}));
 }));
});
self.addEventListener('sync',event=>{
 if(event.tag==='sanabil-sync')event.waitUntil(Promise.resolve().then(async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'sanabil-offline-flush-request'}));
 }));
});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin===self.location.origin&&url.pathname===NOOR_KEY){
  event.respondWith((async()=>{const c=await caches.open(NOOR_CACHE),hit=await c.match(NOOR_KEY);if(hit)return hit;const response=await fetch(NOOR_SOURCE,{mode:'cors'});if(response.ok)await c.put(NOOR_KEY,response.clone());return response})());
  return;
 }
 if(url.origin!==self.location.origin)return; // Never cache Supabase or other-origin responses.
 if(req.mode==='navigate'){
  if(url.pathname!=='/'&&url.pathname!=='/index.html')return;
  event.respondWith((async()=>{
   const cache=await caches.open(SHELL);
   try{const res=await fetch(req);if(res.ok)await cache.put('/index.html',res.clone());return res}
   catch{const hit=await cache.match('/index.html');return hit||new Response('المنصة لم تُجهّز بعد للعمل دون اتصال. افتحها مرة واحدة مع الإنترنت.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
  })());return;
 }
 if(!isAsset(url.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(SHELL),immutable=url.pathname.startsWith('/_next/static/');
  if(immutable){const hit=await cache.match(req);if(hit)return hit}
  try{const res=await fetch(req);if(res.ok&&res.type==='basic')await cache.put(req,res.clone());return res}
  catch{const hit=await cache.match(req);return hit||Response.error()}
 })());
});
