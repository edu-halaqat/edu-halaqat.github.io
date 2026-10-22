/* Sanabil local-first store: user-partitioned IndexedDB, no access tokens in queued writes. */
(()=>{'use strict';
if(window.SanabilOffline)return;
const DB='sanabil-local-first-v1',VERSION=1,OPS='operations',SNAP='snapshots',LEGACY='sanabil_offline_outcomes_v1';
const now=()=>new Date().toISOString();
const networkError=e=>!navigator.onLine||/failed to fetch|networkerror|load failed|network request|fetch failed|statement timeout|timed out|timeout|57014|انتهت مهلة|http\\s*500|internal server error/i.test(String(e?.message||e||''));
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
async function enqueue(item){
 const conn=await db();
 try{await new Promise((resolve,reject)=>{
  // A shared transactional clock preserves edit order across tabs, including
  // writes created in the same millisecond. UUID sorting cannot preserve it.
  const tx=conn.transaction([OPS,SNAP],'readwrite'),snap=tx.objectStore(SNAP);
  const id=item.userId+':queue-order-v1',read=snap.get(id);
  read.onsuccess=()=>{
   item.enqueueOrder=Math.max(Date.now(),Number(read.result?.value||0)+1);
   snap.put({id,userId:item.userId,value:item.enqueueOrder});
   tx.objectStore(OPS).put(item);
  };
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('أُلغي حفظ العملية'));
 })}finally{conn.close()}
}
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
const pendingReads=new Map();
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
 await enqueue(item);await status();
 return {queued:true,saved:Array.isArray(payload.p_rows)?payload.p_rows.length:0,operationId:id};
}
async function hasFreshSnapshot(key,maxAgeMs){
 // Background prefetch only: foreground reads and authorization still use the server.
 if(!Number.isFinite(maxAgeMs)||maxAgeMs<=0)return false;
 try{
  const uid=await userId(),saved=await get(SNAP,uid+':'+key);
  if(!saved||saved.userId!==uid||!Object.prototype.hasOwnProperty.call(saved,'value'))return false;
  const age=Date.now()-Date.parse(saved.capturedAt);
  return Number.isFinite(age)&&age>=0&&age<maxAgeMs;
 }catch{return false}
}
async function readThrough(key,loader){
 const uid=await userId();
 const id=uid+':'+key;
 if(pendingReads.has(id))return pendingReads.get(id);
 const pending=(async()=>{
 if(navigator.onLine){
  try{const value=await loader();put(SNAP,{id,userId:uid,capturedAt:now(),value}).catch(()=>window.dispatchEvent(new CustomEvent('sanabil-offline-snapshot-error')));return value}
  catch(e){if(!networkError(e))throw e}
 }
 const saved=await get(SNAP,id);
 if(!saved)throw Error('لا توجد نسخة محلية لهذا القسم؛ افتحه مرة واحدة أثناء الاتصال بالإنترنت لتجهيزه للعمل دون اتصال.');
 window.dispatchEvent(new CustomEvent('sanabil-offline-snapshot',{detail:{id,capturedAt:saved.capturedAt}}));
 return saved.value;
 })();
 pendingReads.set(id,pending);
 try{return await pending}finally{if(pendingReads.get(id)===pending)pendingReads.delete(id)}
}
function scopeTokens(item){
 const args=item.args||{},date=String(args.p_date||'');
 const ids=Array.isArray(args.p_rows)?args.p_rows.map(x=>String(x?.studentId||'').trim()).filter(Boolean):[];
 if(ids.length)return [...new Set(ids.map(id=>'student:'+date+':'+id))];
 return [item.name+':'+date+':'+String(args.p_circle_id||item.id)];
}
async function flush(callRpc,{batch=false,maxBatchSize=5}={}){
 if(active||!navigator.onLine||!callRpc)return;
 active=true;lastFlushError='';await status();
 try{
  const uid=await userId();
  const all=(await list(OPS)).filter(x=>x.userId===uid).sort((a,b)=>(a.enqueueOrder||Date.parse(a.createdAt))-(b.enqueueOrder||Date.parse(b.createdAt)));
  let singleAfterTimeout=false;
   const blockedScopes=new Set();
  for(let offset=0;offset<all.length;){
   const item=all[offset];
   if(await userId()!==uid)break;
    if(scopeTokens(item).some(scope=>blockedScopes.has(scope))){offset++;continue}
   try{
    if(batch&&!singleAfterTimeout&&item.name!=='submit_offline_attendance_claim'){
     const items=[];let size=0;
     for(const candidate of all.slice(offset,offset+(Number.isInteger(maxBatchSize)?Math.max(1,Math.min(5,maxBatchSize)):5))){
      if(candidate.name==='submit_offline_attendance_claim'||scopeTokens(candidate).some(scope=>blockedScopes.has(scope)))break;
      const n=JSON.stringify(candidate.args).length;
      if(items.length&&size+n>140000)break;
      items.push(candidate);size+=n;
     }
     const response=await callRpc('apply_offline_operations_batch',{p_operations:items.map(x=>({id:x.id,name:x.name,payload:x.args}))});
     if(!Array.isArray(response?.results)||!response.results.length)throw Error('لم يؤكد الخادم استلام دفعة المزامنة');
     for(let i=0;i<response.results.length;i++){
      const confirmed=response.results[i],current=items[i];
      if(!current||confirmed.id!==current.id)throw Error('ترتيب تأكيد دفعة المزامنة غير مطابق');
      if(confirmed.ok!==true||confirmed.result?.ok!==true){
       const error=Error(confirmed.error?.message||'لم يؤكد الخادم حفظ العملية');
       error.operation=current;throw error;
      }
      await acknowledge(current,confirmed.result);offset++;
     }
     if(response.results.length!==items.length)throw Error('تأكيد دفعة المزامنة غير مكتمل');
     continue;
    }
    let result;
    if(item.name==='submit_offline_attendance_claim'){
      result=await callRpc(item.name,item.args);
      if(!['pending_review','already_pending','approved','rejected'].includes(result?.status))throw Error('لم يؤكد الخادم استلام طلب البصمة للمراجعة');
    }else{
      result=await callRpc('apply_offline_operation',{p_operation_id:item.id,p_rpc_name:item.name,p_payload:item.args});
      if(result?.ok!==true)throw Error('لم يؤكد الخادم حفظ العملية');
    }
    await acknowledge(item,result);offset++;
   }catch(error){
    // A batch can confirm its first items before a later item times out.
    // Retry exactly the failed item, never the original first item.
    const failed=error.operation||all[offset]||item;
    // If a five-operation transaction times out, fall back to independent
    // idempotent operations. The server remembers each operation ID, so a
    // lost acknowledgement can never double-apply a result.
    if(batch&&!singleAfterTimeout&&failed.name!=='submit_offline_attendance_claim'&&/statement timeout|timed out|timeout|57014|انتهت مهلة|http\s*500|internal server error/i.test(String(error?.message||error||''))){
      singleAfterTimeout=true;
      try{
        const confirmed=await callRpc('apply_offline_operation',{
          p_operation_id:failed.id,p_rpc_name:failed.name,p_payload:failed.args
        });
        if(confirmed?.ok!==true)throw Error('لم يؤكد الخادم حفظ العملية المفردة.');
        await acknowledge(failed,confirmed);offset++;continue;
      }catch(singleError){error=singleError}
    }
    lastFlushError=String(error?.message||error);
    failed.attempts=(failed.attempts||0)+1;
    failed.lastError=lastFlushError;failed.status=networkError(error)?'queued':'needs_attention';
    await put(OPS,failed);
     // A business denial must not freeze independent students; preserve the
     // failed record and later versions of that same student/date in order.
     if(networkError(error))break;
     for(const token of scopeTokens(failed))blockedScopes.add(token);
     offset++;
     continue;
   }
  }
 }finally{active=false;await status()}
}
async function acknowledge(item,result){
 await del(OPS,item.id);
 // A missing service-worker controller must not block queue acknowledgements.
 navigator.serviceWorker?.controller?.postMessage({type:'ack',id:item.id});
 window.dispatchEvent(new CustomEvent('sanabil-offline-confirmed',{detail:{id:item.id,label:item.label,result}}));
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
style.textContent=`.sanabil-install-pill{position:fixed;bottom:88px;inset-inline-start:12px;z-index:2147483200;display:flex;align-items:center;gap:9px;max-width:min(330px,calc(100vw - 115px));flex-wrap:wrap;padding:7px 9px;background:#073f42;color:#fff;border:1px solid #d8bd88;border-radius:15px;box-shadow:0 3px 18px #0005;font:600 13px/1.6 system-ui;direction:rtl}.sanabil-install-pill button{border:1px solid #d8bd88;background:#d8bd88;color:#073f42;border-radius:9px;padding:5px 10px;cursor:pointer;font:inherit}.sanabil-install-pill:not([data-expanded='1']) button{display:none}.sanabil-install-pill a{color:#fff}`;
document.head.appendChild(style);
function uiRoot(){let root=document.getElementById('sanabil-pwa-offline');if(!root){root=document.createElement('div');root.id='sanabil-pwa-offline';root.className='sanabil-install-pill';root.setAttribute('role','status');root.setAttribute('aria-live','polite');document.body.appendChild(root);root.addEventListener('click',e=>{if(e.target.closest('button'))return;root.dataset.expanded=root.dataset.expanded==='1'?'0':'1';})}return root}
async function updateUi(){
 if(!document.body)return;
 const root=uiRoot(),s=await status(true).catch(()=>({count:0,legacyCount:0,flushing:false,error:'',online:navigator.onLine}));
 // Online + synced is the normal state and needs no permanent screen overlay.
 // Keep the status visible for offline/pending/failed operations only.
 const needsAttention=!s.online||s.count>0||s.legacyCount>0||s.flushing||!!s.error;
 root.hidden=!needsAttention;
 root.replaceChildren();root.title='انقر لعرض خيارات المزامنة';
 if(!needsAttention)return;
 const img=document.createElement('img');img.src='/assets/sanabil-app-visible-192.png';img.alt='';img.width=28;img.height=28;img.style.cssText='border-radius:7px;object-fit:contain;background:#fff';
 root.append(img);
 const text=document.createElement('span');text.textContent=s.online?(s.count?'بانتظار مزامنة '+s.count+' عملية':'سنابل الوحي · متصل'):'سنابل الوحي · يعمل دون اتصال'+(s.count?' · '+s.count+' معلّقة':'');root.append(text);
 if(s.legacyCount){const btn=document.createElement('button');btn.textContent='سجلات سابقة ('+s.legacyCount+')';btn.onclick=async()=>{
  if(!confirm('توجد عمليات قديمة محفوظة على هذا الجهاز بلا تعريف مستخدم. هل تؤكد أنها تخص حسابك الحالي؟'))return;
  try{await importLegacy();updateUi()}catch(error){alert(error.message)}
 };root.append(btn)}
 if(s.error){
  root.title='آخر خطأ في المزامنة: '+s.error;
  const retry=document.createElement('button');retry.textContent='إعادة المحاولة';
  retry.onclick=()=>window.dispatchEvent(new Event('sanabil-offline-retry'));root.append(retry);
  const diagnose=document.createElement('button');diagnose.textContent='تفاصيل السجلات المتعثرة';
  diagnose.onclick=async()=>{
    const uid=await userId().catch(()=>null);
    const queued=(await list(OPS)).filter(x=>x.userId===uid).sort((x,y)=>(x.enqueueOrder||0)-(y.enqueueOrder||0));
    const dlg=document.createElement('dialog');dlg.style.cssText='max-width:min(95vw,620px);max-height:85vh;overflow:auto;border:1px solid #99bdb0;border-radius:16px;padding:18px;direction:rtl;background:var(--surface,#fff);color:var(--text,#183c33)';
    dlg.innerHTML='<h3>تشخيص المزامنة دون حذف السجلات</h3><p>هذه العمليات محفوظة محليًا على جهازك. لا تكرر حفظ الحصيلة حتى تتحقق من نتيجة المزامنة.</p>';
    queued.slice(0,40).forEach((x,i)=>{
      const item=document.createElement('section');item.style.cssText='padding:9px;border:1px solid #a6beb4;border-radius:9px;margin:8px 0;overflow-wrap:anywhere';
      item.textContent=(i+1)+'. '+(x.label||x.name)+' — '+(x.status==='needs_attention'?'تحتاج معالجة':'بانتظار الإرسال')+
        (x.lastError?' | سبب تعثر الخادم: '+x.lastError:'');
      dlg.append(item);
    });
    const close=document.createElement('button');close.textContent='إغلاق';close.onclick=()=>dlg.close();dlg.append(close);
    dlg.addEventListener('close',()=>dlg.remove(),{once:true});document.body.append(dlg);dlg.showModal();
  };root.append(diagnose);
}
}
window.addEventListener('online',()=>updateUi());
window.addEventListener('offline',()=>updateUi());
window.addEventListener('sanabil-offline-queue',()=>{if(document.body)updateUiPending()});
let renderQueued=false;function updateUiPending(){if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;updateUi().catch(()=>{})})}
document.addEventListener('DOMContentLoaded',()=>updateUi().catch(()=>{}));
window.SanabilOffline={queue,flush,readThrough,hasFreshSnapshot,count,status,importLegacy,networkError,updateUi,userId};
})();
