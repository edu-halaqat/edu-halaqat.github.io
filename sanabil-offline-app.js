/* Sanabil local-first store: user-partitioned IndexedDB, no access tokens in queued writes. */
(()=>{'use strict';
if(window.SanabilOffline)return;
const DB='sanabil-local-first-v1',VERSION=1,OPS='operations',SNAP='snapshots',LEGACY='sanabil_offline_outcomes_v1';
const now=()=>new Date().toISOString();
const networkError=e=>!navigator.onLine||/failed to fetch|networkerror|load failed|network request|fetch failed/i.test(String(e?.message||e||''));
function db(){return new Promise((resolve,reject)=>{
 if(!window.indexedDB)return reject(Error('تخزين الجهاز غير متاح؛ افتح المنصة في متصفح يدعم IndexedDB.'));
 const r=indexedDB.open(DB,VERSION);
 r.onupgradeneeded=()=>{for(const name of [OPS,SNAP])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'})};
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('تعذر فتح التخزين المحلي'));
 r.onblocked=()=>reject(Error('أغلق النوافذ القديمة للمنصة لتحديث التخزين المحلي.'));
})}
async function op(store,mode,method,value){
 const conn=await db();try{return await new Promise((resolve,reject)=>{
  const tx=conn.transaction(store,mode),request=tx.objectStore(store)[method](...value);
  let data;request.onsuccess=()=>{data=request.result};request.onerror=()=>reject(request.error);
  tx.oncomplete=()=>resolve(data);tx.onerror=()=>reject(tx.error||Error('تعذر تثبيت البيانات على الجهاز'));
  tx.onabort=()=>reject(tx.error||Error('أُلغي حفظ البيانات المحلية'));
 })}finally{conn.close()}
}
const put=(store,value)=>op(store,'readwrite','put',[value]);
const get=(store,id)=>op(store,'readonly','get',[id]);
const list=store=>op(store,'readonly','getAll',[]);
const del=(store,id)=>op(store,'readwrite','delete',[id]);
async function session(){
 const sdk=window.supabaseClient;
 try{if(navigator.onLine){const response=await sdk?.auth?.getSession();if(response?.data?.session?.user?.id)return response.data.session}}catch{}
 for(const st of [localStorage,sessionStorage]){
  try{const obj=JSON.parse(st.getItem('sanabil-auth-session-v2')||'null');
   const id=obj?.user?.id||obj?.user_id;if(id)return {user:{id}};}catch{}
 }
 return null;
}
async function userId(){const s=await session();if(!s?.user?.id)throw Error('سجّل دخولك مرة واحدة بالإنترنت قبل استخدام الحفظ دون اتصال.');return s.user.id}
let active=false,lastFlushError='';
async function count(){const uid=await userId().catch(()=>null);const data=await list(OPS).catch(()=>[]);return data.filter(x=>x.userId===uid).length}
async function status(silent=false){
 const cnt=await count();let legacy=[];try{legacy=JSON.parse(localStorage.getItem(LEGACY)||'[]')}catch{}
 const detail={count:cnt,legacyCount:Array.isArray(legacy)?legacy.length:0,online:navigator.onLine,flushing:active,error:lastFlushError};
 if(!silent)window.dispatchEvent(new CustomEvent('sanabil-offline-queue',{detail}));return detail;
}
async function queue(name,args,label){
 const uid=await userId(),allowed=new Set(['save_daily_outcomes_guarded','save_student_attendance_guarded','submit_offline_attendance_claim']);
 if(!allowed.has(name))throw Error('هذا الإجراء لم يُجهّز بعد للحفظ دون إنترنت؛ لم يُسجّل كعملية محفوظة.');
 const id=crypto.randomUUID(),payload=JSON.parse(JSON.stringify(args||{}));
 if(name==='submit_offline_attendance_claim')payload.p_operation_id=id;
 const item={id,userId:uid,name,args:payload,label:label||name,createdAt:now(),status:'queued',attempts:0,lastError:''};
 await put(OPS,item);await status();
 return {queued:true,saved:Array.isArray(payload.p_rows)?payload.p_rows.length:0,operationId:id};
}
async function readThrough(key,loader){
 const uid=await userId();
 const id=uid+':'+key;
 if(navigator.onLine){
  try{const value=await loader();await put(SNAP,{id,userId:uid,capturedAt:now(),value});return value}
  catch(e){if(!networkError(e))throw e}
 }
 const saved=await get(SNAP,id);
 if(!saved)throw Error('لا توجد نسخة محلية لهذا القسم؛ افتحه مرة واحدة أثناء الاتصال بالإنترنت لتجهيزه للعمل دون اتصال.');
 window.dispatchEvent(new CustomEvent('sanabil-offline-snapshot',{detail:{id,capturedAt:saved.capturedAt}}));
 return saved.value;
}
async function flush(callRpc){
 if(active||!navigator.onLine||!callRpc)return;
 active=true;lastFlushError='';await status();
 try{
  const uid=await userId();
  const all=(await list(OPS)).filter(x=>x.userId===uid).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  for(const item of all){
   try{
    let result;
    if(item.name==='submit_offline_attendance_claim'){
      result=await callRpc(item.name,item.args);
      if(!['pending_review','already_pending','approved','rejected'].includes(result?.status))throw Error('لم يؤكد الخادم استلام طلب البصمة للمراجعة');
    }else{
      result=await callRpc('apply_offline_operation',{p_operation_id:item.id,p_rpc_name:item.name,p_payload:item.args});
      if(result?.ok!==true)throw Error('لم يؤكد الخادم حفظ العملية');
    }
    await del(OPS,item.id);
    try{const reg=await navigator.serviceWorker?.ready;reg?.active?.postMessage({type:'ack',id:item.id})}catch{}
    window.dispatchEvent(new CustomEvent('sanabil-offline-confirmed',{detail:{id:item.id,label:item.label,result}}));
   }catch(error){
    lastFlushError=String(error?.message||error);
    item.attempts=(item.attempts||0)+1;
    item.lastError=lastFlushError;item.status=networkError(error)?'queued':'needs_attention';
    await put(OPS,item);
    // Preserve order; a later version of the same record must not overtake it.
    break;
   }
  }
 }finally{active=false;await status()}
}
async function importLegacy(){
 const uid=await userId(),raw=JSON.parse(localStorage.getItem(LEGACY)||'[]');
 if(!Array.isArray(raw)||!raw.length)return 0;
 const allowed={save_student_attendance_bulk:'save_student_attendance_guarded',save_daily_outcomes_v2:'save_daily_outcomes_guarded'};
 for(const x of raw){
  const name=allowed[x.name]||x.name;
  if(!['save_student_attendance_guarded','save_daily_outcomes_guarded'].includes(name))throw Error('يوجد سجل قديم غير مدعوم؛ لن تُحذف البيانات القديمة.');
  await put(OPS,{id:x.id||crypto.randomUUID(),userId:uid,name,args:x.args,label:x.label||name,createdAt:x.queuedAt||now(),status:'queued',attempts:0,lastError:''});
 }
 // Only clear legacy copy once every write transaction has completed.
 localStorage.removeItem(LEGACY);await status();return raw.length;
}
const style=document.createElement('style');
style.textContent=`.sanabil-install-pill{position:fixed;bottom:88px;inset-inline-start:12px;z-index:2147483200;display:flex;align-items:center;gap:9px;max-width:calc(100vw - 24px);padding:9px 12px;background:#073f42;color:#fff;border:1px solid #d8bd88;border-radius:15px;box-shadow:0 3px 18px #0005;font:600 13px/1.6 system-ui;direction:rtl}.sanabil-install-pill button{border:1px solid #d8bd88;background:#d8bd88;color:#073f42;border-radius:9px;padding:5px 10px;cursor:pointer;font:inherit}.sanabil-install-pill a{color:#fff}`;
document.head.appendChild(style);
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;updateUi()});
window.addEventListener('appinstalled',()=>{deferredInstall=null;updateUi()});
function uiRoot(){let root=document.getElementById('sanabil-pwa-offline');if(!root){root=document.createElement('div');root.id='sanabil-pwa-offline';root.className='sanabil-install-pill';root.setAttribute('role','status');root.setAttribute('aria-live','polite');document.body.appendChild(root)}return root}
async function updateUi(){
 if(!document.body)return;
 const root=uiRoot(),s=await status(true).catch(()=>({count:0,legacyCount:0,flushing:false,error:'',online:navigator.onLine}));
 root.replaceChildren();
 const img=document.createElement('img');img.src='/assets/sanabil-app-192.png';img.alt='';img.width=28;img.height=28;img.style.cssText='border-radius:7px;object-fit:contain;background:#fff';
 root.append(img);
 const text=document.createElement('span');text.textContent=s.online?(s.count?'بانتظار مزامنة '+s.count+' عملية':'سنابل الوحي · متصل'):'سنابل الوحي · يعمل دون اتصال'+(s.count?' · '+s.count+' معلّقة':'');root.append(text);
 if(s.legacyCount){const btn=document.createElement('button');btn.textContent='سجلات سابقة ('+s.legacyCount+')';btn.onclick=async()=>{
  if(!confirm('توجد عمليات قديمة محفوظة على هذا الجهاز بلا تعريف مستخدم. هل تؤكد أنها تخص حسابك الحالي؟'))return;
  try{await importLegacy();updateUi()}catch(error){alert(error.message)}
 };root.append(btn)}
 if(deferredInstall&&!window.matchMedia('(display-mode: standalone)').matches){const b=document.createElement('button');b.textContent='تثبيت التطبيق';b.onclick=async()=>{const event=deferredInstall;deferredInstall=null;await event.prompt();await event.userChoice.catch(()=>null);updateUi()};root.append(b)}
 if(s.error){root.title='آخر خطأ في المزامنة: '+s.error;const retry=document.createElement('button');retry.textContent='تعذر إرسال سجل · إعادة المحاولة';retry.onclick=()=>window.dispatchEvent(new Event('sanabil-offline-retry'));root.append(retry)}
}
window.addEventListener('online',()=>updateUi());
window.addEventListener('offline',()=>updateUi());
window.addEventListener('sanabil-offline-queue',()=>{if(document.body)updateUiPending()});
let renderQueued=false;function updateUiPending(){if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;updateUi().catch(()=>{})})}
document.addEventListener('DOMContentLoaded',()=>updateUi().catch(()=>{}));
window.SanabilOffline={queue,flush,readThrough,count,status,importLegacy,networkError,updateUi,userId};
})();
