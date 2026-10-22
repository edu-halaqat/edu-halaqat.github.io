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
 // Record stable action/CSS identifiers only. Never access visible text or inputs.
 const named=a.dataset?.action||a.dataset?.view||a.dataset?.nav;
 if(named)return safe(String(named).replace(/\d+/g,'#'));
 if(a.id)return 'id:'+safe(a.id.replace(/\d+/g,'#'));
 const classes=Array.from(a.classList||[]);
 const identity=classes.find(x=>/^sl-[a-z0-9-]+$/i.test(x))
   ||classes.find(x=>/^button-[a-z0-9-]+$/i.test(x));
 if(identity)return 'class:'+safe(identity);
 return (a.tagName||'button').toLowerCase()+':'+safe(a.getAttribute?.('type')||'control');
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
 const parent=document.querySelector('.sl-performance-real:not([data-central-mounted])');
 if(!parent)return;
 parent.dataset.centralMounted='1';
 const ar=window.SanabilArabicUI;
 if(!ar){parent.dataset.centralMounted='';return}
 const box=document.createElement('section');box.className='sl-performance-real sl-central-report';box.dataset.centralMounted='1';box.dir='rtl';
 box.innerHTML='<h3>مركز تشخيص أداء المنصة — جميع الأجهزة</h3>'+
  '<p>قراءات الخادم للحسابات النشطة التي وصلت أحداثها إلى قاعدة البيانات، وليست آخر 150 حركة فقط. لا يجمع التقرير إجابات الطلاب ولا ما يكتب في الحقول. الأجهزة غير المتصلة لا تظهر حركاتها حتى تتم مزامنتها.</p>'+
  '<div class="sl-central-tools" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">'+
    '<button type="button" class="button" data-activity-period="live">لحظي · آخر 15 دقيقة</button>'+
    '<button type="button" class="button" data-activity-period="today">اليوم · بتوقيت الرياض</button>'+
    '<button type="button" class="button" data-activity-period="week">الأسبوع · آخر 7 أيام</button>'+
    '<button type="button" class="button" data-activity-refresh>تحديث الآن</button>'+
    '<button type="button" class="button" data-activity-csv>تنزيل جدول بيانات</button>'+
    '<button type="button" class="button" data-activity-json>تنزيل التقرير المفصّل</button>'+
    '<label style="display:flex;align-items:center;gap:5px"><input type="checkbox" data-activity-auto checked> تحديث تلقائي كل 30 ثانية</label>'+
  '</div><p role="status" data-activity-status></p>'+
  '<div data-activity-summary></div><div data-activity-insights></div>'+
  '<div data-activity-views></div><div data-activity-actions></div>'+
  '<div data-activity-actors></div><div data-activity-devices></div>'+
  '<div data-activity-trend></div><div data-activity-errors></div>';
 parent.after(box);
 const style=document.createElement('style');
 style.textContent='@media(max-width:640px){.sl-central-report table{min-width:0!important;display:block!important;width:100%!important;white-space:normal!important}.sl-central-report thead{display:none!important}.sl-central-report tbody,.sl-central-report tr{display:block!important}.sl-central-report tbody tr{border:1px solid #87a89b;border-radius:10px;margin:9px 0;padding:8px}.sl-central-report td{display:flex!important;justify-content:space-between;gap:10px;border:0!important;padding:6px!important;white-space:normal!important;overflow-wrap:anywhere}.sl-central-report td:before{content:attr(data-label);font-weight:700;flex:0 0 45%}.sl-central-report [data-activity-actions] td,.sl-central-report [data-activity-errors] td{font-size:13px}}';
 box.append(style);
 const status=box.querySelector('[data-activity-status]');
 const slots={
  summary:box.querySelector('[data-activity-summary]'),
  insights:box.querySelector('[data-activity-insights]'),
  views:box.querySelector('[data-activity-views]'),
  actions:box.querySelector('[data-activity-actions]'),
  actors:box.querySelector('[data-activity-actors]'),
  devices:box.querySelector('[data-activity-devices]'),
  trend:box.querySelector('[data-activity-trend]'),
  errors:box.querySelector('[data-activity-errors]')
 };
 const pretty=n=>n===null||n===undefined?'—':Number(n).toLocaleString('ar-SA');
 const ms=n=>ar.duration(n);
 const date=t=>t?new Date(t).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}):'—';
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=String(text??'');return node};
 let period='today',busy=false,report=null;
 const tabs=()=>box.querySelectorAll('[data-activity-period]').forEach(button=>{
  const chosen=button.dataset.activityPeriod===period;
  button.setAttribute('aria-pressed',String(chosen));
  button.style.outline=chosen?'2px solid #078b80':'';
 });
 const table=(slot,title,columns,rows)=>{
  slot.replaceChildren();
  const heading=el('h4',title);heading.style.margin='18px 0 8px';slot.append(heading);
  if(!rows?.length){slot.append(el('p','لا توجد بيانات في هذه الفترة.'));return}
  const overflow=document.createElement('div');overflow.style.cssText='max-width:100%;max-height:400px;overflow:auto';
  const tab=document.createElement('table');tab.style.cssText='width:100%;direction:rtl';
  const tr=document.createElement('tr');
  for(const column of columns)tr.append(el('th',column[0]));
  const thead=document.createElement('thead');thead.append(tr);tab.append(thead);
  const tbody=document.createElement('tbody');
  for(const row of rows){
   const tr=document.createElement('tr');
   for(const column of columns){const cell=el('td',column[1](row));cell.dataset.label=column[0];tr.append(cell)}
   tbody.append(tr);
  }
  tab.append(tbody);overflow.append(tab);slot.append(overflow);
 };
 const textLine=(parent,text)=>{
  const p=el('p',text);p.style.cssText='margin:6px 0;line-height:1.8';parent.append(p);
 };
 const render=payload=>{
  report=payload;
  const sum=payload.summary||{},actorRows=payload.byActor||[],actions=payload.byAction||[];
  const failures=actions.filter(x=>Number(x.failures)>0);
  const slow=actions.filter(x=>Number(x.p95_ms)>2000&&Number(x.events)>=3);
  const labels={live:'آخر 15 دقيقة',today:'اليوم (الرياض)',week:'آخر 7 أيام'};
  slots.summary.replaceChildren();
  slots.summary.append(el('h4','ملخص '+labels[period]));
  const summaryItems=[['الحركات المستلمة',sum.events],['الحسابات',sum.users],
   ['جلسات الاستخدام',sum.sessions],['الإخفاقات المرصودة',sum.failures],
   ['العمليات الأبطأ من ثانيتين',sum.slow],
   [ar.percentile,ms(sum.p95Ms)]];
  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px';
  for(const [label,value] of summaryItems){
   const item=document.createElement('div');
   item.style.cssText='border:1px solid #759e8c;border-radius:10px;padding:10px';
   item.append(el('small',label),el('p',typeof value==='number'?pretty(value):value));
   grid.append(item);
  }
  slots.summary.append(grid);
  slots.insights.replaceChildren();
  slots.insights.append(el('h4','أولويات معالجة الأعطال'));
  if(failures.length)for(const item of failures.slice(0,5))
   textLine(slots.insights,'تعثر متكرر في '+ar.view(item.view_key)+' — '+ar.action(item.action_key)+
    '؛ عدد المحاولات غير الناجحة: '+pretty(item.failures)+' من '+pretty(item.events)+
    '. '+ar.note(item.action_key));
  else textLine(slots.insights,'لم تُرصد استدعاءات فاشلة في هذه الفترة؛ هذا لا يثبت عدم وجود أعطال غير مرصودة.');
  if(slow.length)for(const item of slow.slice(0,5))
   textLine(slots.insights,'تأخر استجابة في '+ar.view(item.view_key)+' — '+ar.action(item.action_key)+
    '؛ '+ar.percentile+': '+ms(item.p95_ms)+' (عدد القياسات: '+pretty(item.events)+')');
  table(slots.views,'النوافذ الأكثر تعثرًا',
   [['النافذة',x=>ar.view(x.view_key)],['الحركات',x=>pretty(x.events)],
    ['الإخفاقات',x=>pretty(x.failures)],['فوق ثانيتين',x=>pretty(x.slow)],
    ['زمن الاستجابة لـ٩٥٪',x=>ms(x.p95_ms)]],payload.byView);
  table(slots.actions,'الإجراءات والاختناقات حسب نسبة التعثر والبطء',
   [['النافذة',x=>ar.view(x.view_key)],['الإجراء',x=>ar.action(x.action_key)],['النوع',x=>ar.kind(x.kind)],
    ['الحركات',x=>pretty(x.events)],['الإخفاقات',x=>pretty(x.failures)],
    ['فوق ثانيتين',x=>pretty(x.slow)],['المتوسط',x=>ms(x.mean_ms)],
    ['زمن الاستجابة لـ٩٥٪',x=>ms(x.p95_ms)]],actions);
  table(slots.actors,'تغطية جميع الحسابات التي أرسلت أحداثًا',
   [['المستخدم',x=>x.actor_name],['الأحداث',x=>pretty(x.events)],
    ['الجلسات',x=>pretty(x.sessions)],['الإخفاقات',x=>pretty(x.failures)],
    ['فوق ثانيتين',x=>pretty(x.slow)],['زمن الاستجابة لـ٩٥٪',x=>ms(x.p95_ms)]],actorRows);
  table(slots.devices,'التغطية حسب نوع الجهاز',
   [['الجهاز',x=>ar.device(x.device_kind)],['المستخدمون',x=>pretty(x.users)],
    ['الأحداث',x=>pretty(x.events)],['الإخفاقات',x=>pretty(x.failures)],
    ['زمن الاستجابة لـ٩٥٪',x=>ms(x.p95_ms)]],payload.byDevice);
  table(slots.trend,'التطور الزمني · بتوقيت الرياض',
   [['الفترة',x=>date(x.bucket)],
    ['الأحداث',x=>pretty(x.events)],['الإخفاقات',x=>pretty(x.failures)],
    ['المستخدمون',x=>pretty(x.users)]],payload.trend);
  table(slots.errors,'آخر الأخطاء والأحداث الفاشلة',
   [['التوقيت',x=>date(x.created_at)],['المستخدم',x=>x.actor_name],
    ['النافذة',x=>ar.view(x.view_key)],['الإجراء',x=>ar.action(x.action_key)],
    ['المدة',x=>ms(x.duration_ms)],['الجهاز',x=>ar.device(x.device_kind)]],payload.recentFailures);
 };
 const load=async()=>{
  if(busy||!box.isConnected||!client())return;
  busy=true;status.textContent='جارٍ تحليل سجلات جميع المستخدمين…';
  try{
   const {data,error}=await client().rpc('get_platform_activity_report',{p_period:period});
   if(error)throw error;
   if(!data||typeof data!=='object'||!data.summary)throw Error('الرد غير صالح');
   render(data);
   status.textContent='آخر تحديث: '+date(data.to)+' · '+pretty(data.summary.events)+
    ' حركة مستلمة · '+pretty(data.summary.users)+' حسابات. سجلات الأجهزة غير المتصلة تصل بعد المزامنة.';
  }catch(error){status.textContent='تعذر إنشاء التقرير المركزي: '+ar.error(error?.message||'خطأ اتصال')}
  finally{busy=false}
 };
 const rowsCSV=(data)=>{
  const out=[['القسم','النافذة أو المستخدم','العملية أو النوع','الحركات','الإخفاقات','زمن الاستجابة لـ٩٥٪ (مللي ثانية)']];
  const section=(name,list,fields)=>{for(const x of list||[])out.push([name,...fields(x)])};
  section('المستخدمون',data.byActor,x=>[x.actor_name,'',x.events,x.failures,x.p95_ms]);
  section('النوافذ',data.byView,x=>[ar.view(x.view_key),'',x.events,x.failures,x.p95_ms]);
  section('الإجراءات',data.byAction,x=>[ar.view(x.view_key),ar.action(x.action_key),x.events,x.failures,x.p95_ms]);
  section('الأجهزة',data.byDevice,x=>[ar.device(x.device_kind),'',x.events,x.failures,x.p95_ms]);
  section('التطور الزمني',data.trend,x=>[date(x.bucket),'',x.events,x.failures,'']);
  section('الأخطاء',data.recentFailures,x=>[date(x.created_at),ar.action(x.action_key),'','',x.duration_ms]);
  return out;
 };
 const arabicJSON=data=>({
  'الفترة':({live:'لحظي',today:'يومي',week:'أسبوعي'})[data.period]||'فترة مختارة',
  'بداية الفترة':date(data.from),'نهاية الفترة':date(data.to),
  'الملخص':{'الحركات':data.summary?.events,'المستخدمون':data.summary?.users,
    'الجلسات':data.summary?.sessions,'الإخفاقات':data.summary?.failures,
    'العمليات البطيئة':data.summary?.slow,'زمن الاستجابة لـ٩٥٪':data.summary?.p95Ms},
  'النوافذ':(data.byView||[]).map(x=>({'النافذة':ar.view(x.view_key),'الحركات':x.events,'الإخفاقات':x.failures,'العمليات البطيئة':x.slow,'زمن الاستجابة لـ٩٥٪':x.p95_ms})),
  'الإجراءات':(data.byAction||[]).map(x=>({'النافذة':ar.view(x.view_key),'الإجراء':ar.action(x.action_key),'النوع':ar.kind(x.kind),'الحركات':x.events,'الإخفاقات':x.failures,'المتوسط':x.mean_ms,'زمن الاستجابة لـ٩٥٪':x.p95_ms,'تفسير التعثر':Number(x.failures)?ar.note(x.action_key):'لم يُرصد تعثر لهذا الإجراء'})),
  'الحسابات':(data.byActor||[]).map(x=>({'المستخدم':x.actor_name,'الحركات':x.events,'الإخفاقات':x.failures,'الجلسات':x.sessions})),
  'الأجهزة':(data.byDevice||[]).map(x=>({'نوع الجهاز':ar.device(x.device_kind),'المستخدمون':x.users,'الحركات':x.events,'الإخفاقات':x.failures})),
  'التطور الزمني':(data.trend||[]).map(x=>({'الفترة':date(x.bucket),'الحركات':x.events,'الإخفاقات':x.failures})),
  'آخر الإخفاقات':(data.recentFailures||[]).map(x=>({'التاريخ':date(x.created_at),'المستخدم':x.actor_name,'النافذة':ar.view(x.view_key),'الإجراء':ar.action(x.action_key),'التفسير':ar.note(x.action_key)})),
  'تنبيه':'تُعرض أسماء عربية للأحداث دون تغيير مفاتيحها الأصلية. العدد لا يوضح بمفرده سبب كل رفض؛ يلزم الرجوع إلى سجلات الخادم.'
 });
 const quoteCSV=value=>{
  let text=String(value??'');
  // Prevent spreadsheet apps from evaluating formulas from account names.
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
 };
 const download=format=>{
  if(!report){status.textContent='أنشئ التقرير أولًا ثم اختر التصدير.';return}
  const content=format==='csv'
   ?'\uFEFF'+rowsCSV(report).map(row=>row.map(quoteCSV).join(',')).join('\r\n')
   :JSON.stringify(arabicJSON(report),null,2);
  const mime=format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8';
  const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='تقرير-نشاط-سنابل-'+({live:'لحظي',today:'يومي',week:'أسبوعي'})[period]+'-'+new Date().toISOString().slice(0,10)+'.'+format;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 };
 box.querySelectorAll('[data-activity-period]').forEach(btn=>btn.addEventListener('click',()=>{
  period=btn.dataset.activityPeriod;tabs();load();
 }));
 box.querySelector('[data-activity-refresh]').addEventListener('click',()=>{flush().finally(load)});
 box.querySelector('[data-activity-csv]').addEventListener('click',()=>download('csv'));
 box.querySelector('[data-activity-json]').addEventListener('click',()=>download('json'));
 const timer=setInterval(()=>{
  if(!box.isConnected){clearInterval(timer);return}
  if(box.querySelector('[data-activity-auto]').checked&&!document.hidden)load();
 },30000);
 tabs();load();
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
