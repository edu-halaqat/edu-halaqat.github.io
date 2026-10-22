/* Central, admin-readable operational actions. Never transmits typed values, student IDs or grades. */
(()=>{'use strict';
if(window.SanabilActivity)return;
const PREFIX='sanabil-activity-queue-v1:', MAX_LOCAL=1000;
const client=()=>window.supabaseClient;
const session=crypto.randomUUID();
let user=null,flushing=false,started=false,ephemeral=[];
const safe=(value,max=100)=>String(value||'').replace(/[^a-zA-Z0-9_:#.\-/]/g,'_').slice(0,max)||'unknown';
const device=()=>/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Android|iPhone|Mobile/i.test(navigator.userAgent)?'mobile':'desktop';
const view=()=>safe(document.querySelector('[aria-current="page"][data-view]')?.dataset?.view||
 document.querySelector('.sl-view.active[data-view]')?.dataset?.view||
 document.body.dataset.sanabilView||location.hash.replace(/^#/, '')||location.pathname,60);
const storageKey=()=>PREFIX+user+':'+session;
function allKeys(){const keys=[];if(!user)return keys;
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PREFIX+user+':'))keys.push(k)}}catch{}
 return keys.sort();
}
function read(k){try{const x=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function save(k,x){try{if(x.length)localStorage.setItem(k,JSON.stringify(x));else localStorage.removeItem(k);return true}catch{return false}}
function record(kind,action,ms=null,ok=null){
 if(!user)return;
 const e={id:crypto.randomUUID(),session,kind,view:view(),action:safe(action),
  ms:Number.isFinite(ms)?Math.min(120000,Math.max(0,Math.round(ms))):null,
  ok:typeof ok==='boolean'?ok:null,device:device()};
 const key=storageKey(),list=read(key);
 list.push(e);
 if(!save(key,list.slice(-MAX_LOCAL)))ephemeral.push(e);
 if(list.length>=25)flush().catch(()=>{});
}
async function flush(){
 if(flushing||!user||!client()||!navigator.onLine)return;
 flushing=true;
 try{
  for(const key of allKeys()){
   const items=read(key);if(!items.length){save(key,[]);continue}
   const batch=items.slice(0,25);
   const {error}=await client().rpc('record_platform_activity_batch',{p_events:batch});
   if(error)throw error;
   const ids=new Set(batch.map(x=>x.id));
   save(key,read(key).filter(x=>!ids.has(x.id)));
  }
  if(ephemeral.length){
   const batch=ephemeral.slice(0,25);
   const {error}=await client().rpc('record_platform_activity_batch',{p_events:batch});
   if(error)throw error;
   ephemeral.splice(0,batch.length);
  }
 }catch(e){/* Keep unacknowledged events for the next retry; never interrupt teaching. */}
 finally{flushing=false}
}
const targetName=el=>{
 const a=el?.closest?.('button,a,[role="button"]');
 if(!a)return null;
 return a.dataset?.action||a.dataset?.view||a.dataset?.nav||
  a.getAttribute('type')&&('button:'+safe(a.getAttribute('type')))||
  (a.tagName.toLowerCase()+':'+safe(a.id||a.classList?.[0]||'control'));
};
document.addEventListener('click',event=>{
 const name=targetName(event.target);if(name)record('click',name);
},true);
document.addEventListener('change',event=>{
 const x=event.target;if(!x||!x.matches?.('input,select,textarea'))return;
 record('change',x.tagName.toLowerCase()+':'+safe(x.getAttribute('name')||x.getAttribute('type')||x.id||'field').replace(/\d+/g,'#'));
},true);
document.addEventListener('submit',event=>record('submit',safe(event.target?.id||event.target?.getAttribute?.('data-action')||'form')),true);
window.addEventListener('unhandledrejection',()=>record('error','unhandled-promise'));
window.addEventListener('error',()=>record('error','javascript-runtime'));
window.addEventListener('online',()=>flush());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush()});
function mountAdminPanel(){
 const parent=document.querySelector('.sl-performance-real');
 if(!parent||parent.dataset.centralMounted)return;
 parent.dataset.centralMounted='1';
 const box=document.createElement('section');box.className='sl-performance-real';box.dir='rtl';
 box.innerHTML='<h3>نشاط المنصة المركزي — جميع الأجهزة</h3><p>عمليات المستخدمين المسجلين منذ تفعيل هذه الميزة، بما فيها مدير النظام. يحتفظ الخادم بهوية المنفذ والتوقيت والنافذة ونوع العملية ومدتها ونجاحها دون تفاصيل الطلاب أو المدخلات.</p><button type="button" class="button" data-activity-refresh>تحديث أنشطة جميع المستخدمين</button><p data-activity-status role="status"></p><div data-activity-table style="max-height:420px;overflow:auto"></div>';
 parent.after(box);
 const status=box.querySelector('[data-activity-status]'),body=box.querySelector('[data-activity-table]');
 let busy=false;
 const load=async()=>{
  if(busy||!client())return;busy=true;status.textContent='جارٍ جلب الأحداث من الخادم…';
  try{
   const {data,error}=await client().rpc('get_platform_activity_events',{p_limit:150});
   if(error)throw error;
   const items=Array.isArray(data)?data:[];
   status.textContent=items.length?'آخر '+items.length+' حدث مسجل؛ يعرض الأحدث أولًا.':'لا توجد أحداث مركزية مسجلة حتى الآن.';
   const table=document.createElement('table');table.style.width='100%';
   const head=document.createElement('tr');
   for(const h of ['التوقيت','المستخدم','الدور','النافذة','الإجراء','المدة','النتيجة','الجهاز']){
    const th=document.createElement('th');th.textContent=h;head.append(th);
   }
   const thead=document.createElement('thead');thead.append(head);table.append(thead);
   const tbody=document.createElement('tbody');
   for(const e of items){
    const tr=document.createElement('tr');
    const cols=[new Date(e.created_at).toLocaleString('ar-SA'),
     e.actor_name||'غير معروف',e.actor_role||'—',e.view_key||'—',
     (e.kind||'')+' · '+(e.action_key||''),e.duration_ms==null?'—':e.duration_ms+' ms',
     e.succeeded===null?'—':e.succeeded?'نجاح':'تعثر',e.device_kind||'—'];
    for(const v of cols){const td=document.createElement('td');td.textContent=v;tr.append(td)}
    tbody.append(tr);
   }
   table.append(tbody);body.replaceChildren(table);
  }catch(e){status.textContent='تعذر قراءة القياسات المركزية: '+(e.message||'خطأ في الاتصال')}
  finally{busy=false}
 };
 box.querySelector('[data-activity-refresh]').onclick=load;
 load();
}
const observer=new MutationObserver(()=>{if(document.querySelector('.sl-performance-real:not([data-central-mounted])'))mountAdminPanel()});
observer.observe(document.documentElement,{subtree:true,childList:true});
async function begin(){
 if(started||!client())return;started=true;
 try{
  const {data}=await client().auth.getSession();
  user=data?.session?.user?.id||null;
  client().auth.onAuthStateChange((_event,sessionData)=>{
   const next=sessionData?.user?.id||null;
   if(next!==user){user=next;ephemeral=[]}
   if(user)flush();
  });
  if(user)flush();
 }catch{started=false}
}
if(client())begin();else{
 const timer=setInterval(()=>{if(client()){clearInterval(timer);begin()}},900);
 setTimeout(()=>clearInterval(timer),60000);
}
setInterval(()=>flush(),8000);
window.SanabilActivity={record,flush};
})();
