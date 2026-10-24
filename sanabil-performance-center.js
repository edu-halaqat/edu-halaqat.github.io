/* Unified administrator performance laboratory. v20261024
   Actual telemetry is distinct from single-session synthetic request concurrency.
   No real student attendance, grades, plans or user accounts are modified. */
(()=>{'use strict';
if(window.SanabilPerformanceCenter)return;
const VERSION='20261024-performance-center2';
const STAGES=[1,5,10,25,50,100];
const OPERATIONS=[
 {id:'read',title:'قراءة مقررات الحلقة',rpc:'get_daily_assignments',params:(circle,date)=>({p_circle_id:circle,p_date:date})},
 {id:'access',title:'التحقق من صلاحية الجلسة',rpc:'circle_session_access',params:(circle,date)=>({p_circle_id:circle,p_date:date})},
 {id:'dryrun',title:'كتابة تشخيصية متراجَع عنها',rpc:'sanabil_performance_save_dryrun',params:circle=>({p_circle_id:circle})}
];
const number=n=>Number(n||0).toLocaleString('ar-SA');
const formatMs=n=>Number.isFinite(n)?(n/1000).toFixed(2)+' ثانية':'غير متاح';
const dateRiyadh=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const percentile=(numbers,p=.95)=>{const a=numbers.filter(Number.isFinite).slice().sort((x,y)=>x-y);return a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;};
const stats=samples=>{const ok=samples.filter(s=>s.ok),durations=ok.map(s=>s.ms);
 return {attempts:samples.length,successes:ok.length,failures:samples.length-ok.length,
  p50:percentile(durations,.5),p95:percentile(durations),max:durations.length?Math.max(...durations):null,
  errorRate:samples.length?Math.round(10000*(samples.length-ok.length)/samples.length)/100:null,
  errors:samples.filter(s=>!s.ok).slice(0,3).map(s=>s.error).filter(Boolean)};};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const arabic=value=>window.SanabilArabicUI?.performanceText?.(value)??String(value??'');
const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=arabic(value);if(className)node.className=className;return node;};
const getClient=()=>window.supabaseClient;
const note='اختبار المستخدمين الافتراضيين يولّد طلبات متزامنة من جلسة مدير النظام فقط؛ لا يحاكي هويات وصلاحيات 100 حساب مستقل، ولا يختبر رسم الواجهات على 100 جهاز أو حفظ الحصيلة الفعلي. لا يُعدّ شهادة جاهزية إنتاجية.';
let dialog=null,controller=null,running=false,result=null,baseline=null,circles=[],selectedScope='today';
function style(){
 if(document.getElementById('spc-styles'))return;
 const el=document.createElement('style');el.id='spc-styles';
 el.textContent=[
 '.spc-root{box-sizing:border-box;width:min(1200px,98vw);height:min(95vh,1050px);max-height:95vh;max-width:98vw;padding:0;border:1px solid #7a9c90;border-radius:18px;color:var(--ink,#1b352d);background:var(--surface,#fff);direction:rtl;font-family:inherit}',
 '.spc-root::backdrop{background:rgba(9,25,20,.72)}',
 '.spc-shell{padding:20px 22px 34px;overflow-y:auto;max-height:95vh;box-sizing:border-box}',
 '.spc-top{display:flex;justify-content:space-between;gap:14px;align-items:start;flex-wrap:wrap}',
 '.spc-top h2{margin:0 0 4px;font-size:23px}.spc-top p{margin:0;color:inherit;opacity:.8}',
 '.spc-btn{border:1px solid #94b4a5;border-radius:11px;background:transparent;color:inherit;padding:10px 15px;cursor:pointer;min-height:42px;font:inherit}',
 '.spc-btn.primary{background:#126f61;color:#fff;border-color:#126f61}.spc-btn:disabled{opacity:.45;cursor:not-allowed}',
 '.spc-actions{display:flex;gap:9px;flex-wrap:wrap;margin:15px 0}',
 '.spc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0}',
 '.spc-card{border:1px solid #afc5bb;padding:14px;border-radius:13px;background:rgba(124,160,142,.07)}',
 '.spc-card h3{font-size:17px;margin:0 0 6px}.spc-card p{margin:4px 0;font-size:14px}',
 '.spc-card strong{display:block;font-size:24px;line-height:1.6;font-variant-numeric:tabular-nums}',
 '.spc-muted{font-size:13px;line-height:1.8;opacity:.85}.spc-alert{padding:13px;border:1px solid #b98b37;border-radius:12px;background:rgba(188,143,50,.10);line-height:1.8}',
 '.spc-section{border-top:1px solid #b4cdc1;margin-top:20px;padding-top:14px}.spc-section h3{margin:0 0 10px}',
 '.spc-settings{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:12px 0}',
 '.spc-settings label{display:flex;flex-direction:column;gap:5px;font-size:14px}',
 '.spc-settings select,.spc-settings input{background:transparent;color:inherit;border:1px solid #9bb9aa;border-radius:8px;padding:8px 10px;max-width:100%;min-height:40px;font:inherit}',
 '.spc-table-wrap{max-width:100%;overflow:auto;margin:10px 0}',
 '.spc-table{width:100%;border-collapse:collapse;text-align:right;min-width:550px;font-size:14px}',
 '.spc-table th,.spc-table td{padding:9px;border-bottom:1px solid #b7c8c1;vertical-align:top}.spc-table th{font-weight:700}',
 '.spc-status{font-size:14px;min-height:22px;white-space:pre-wrap;line-height:1.8}',
 '.spc-progress{width:100%;height:11px;accent-color:#168879;margin:8px 0}',
 '.spc-bad{color:#a83b34}.spc-good{color:#087661}.spc-report p{margin:7px 0}',
 '.spc-root{overflow-x:hidden!important}.spc-root *{box-sizing:border-box;min-width:0}',
 '.spc-top{position:sticky;top:0;z-index:2;padding:9px 0 13px;background:var(--surface,#fff);border-bottom:1px solid #b5cdc1}',
 '.spc-table-wrap{overflow:auto;max-width:100%}.spc-mobile-cards{display:none}',
 '.spc-mobile-card{border:1px solid #98b7aa;border-radius:12px;padding:12px;margin:10px 0;background:rgba(124,160,142,.06)}',
 '.spc-mobile-pair{display:grid;grid-template-columns:minmax(90px,40%) minmax(0,1fr);gap:10px;padding:6px 0;border-bottom:1px solid #bdd1c8;overflow-wrap:anywhere}',
 '.spc-mobile-pair:last-child{border-bottom:0}.spc-mobile-label{font-weight:700}',
 '.spc-mobile-value{white-space:normal;overflow-wrap:anywhere;unicode-bidi:plaintext}',
 '@media(max-width:850px){.spc-table-wrap{display:none}.spc-mobile-cards{display:block;width:100%}.spc-root{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0}.spc-shell{max-height:100dvh;padding:14px 12px}.spc-top h2{font-size:20px}.spc-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.spc-settings>*{max-width:100%}}',
 '@media print{body>*:not(dialog){display:none!important}.spc-root{display:block!important;position:static!important;overflow:visible!important;width:100%!important;max-height:none!important;max-width:none!important;border:0!important}.spc-shell{max-height:none!important;overflow:visible!important}.spc-no-print{display:none!important}.spc-table{min-width:0!important}.spc-card{break-inside:avoid}}'
 ].join('\n');document.head.append(el);
}
function status(message,isError=false){
 const node=dialog?.querySelector('[data-spc-status]');if(node){node.textContent=arabic(message);node.classList.toggle('spc-bad',isError)}
}
function table(rows,headings){
 const group=document.createElement('div');group.className='spc-table-group';
 const wrap=document.createElement('div');wrap.className='spc-table-wrap';
 const tab=document.createElement('table');tab.className='spc-table';tab.dir='rtl';
 const tr=document.createElement('tr');headings.forEach(h=>tr.append(text('th',h)));
 const th=document.createElement('thead');th.append(tr);tab.append(th);
 const tb=document.createElement('tbody'),cards=document.createElement('div');cards.className='spc-mobile-cards';
 rows.forEach(row=>{
  const line=document.createElement('tr'),card=document.createElement('article');card.className='spc-mobile-card';
  row.forEach((value,i)=>{
   line.append(text('td',value));
   const pair=document.createElement('div');pair.className='spc-mobile-pair';
   pair.append(text('span',headings[i]||'المؤشر','spc-mobile-label'),text('span',value,'spc-mobile-value'));
   card.append(pair);
  });
  tb.append(line);cards.append(card);
 });
 tab.append(tb);wrap.append(tab);group.append(wrap,cards);return group;
}
function card(label,value,detail){
 const el=document.createElement('div');el.className='spc-card';
 el.append(text('p',label),text('strong',value),text('p',detail||''));
 return el;
}
function setBusy(on){
 running=on;dialog?.querySelectorAll('[data-spc-start], [data-spc-circle], [data-spc-day], [data-spc-users], [data-spc-period]').forEach(el=>el.disabled=on);
 const stop=dialog?.querySelector('[data-spc-stop]');if(stop)stop.disabled=!on;
}
async function rpc(name,args={},signal){
 const client=getClient();if(!client)throw Error('الاتصال بقاعدة البيانات غير مهيأ.');
 const operation=client.rpc(name,args);
 const response=signal&&typeof operation.abortSignal==='function'?
   await operation.abortSignal(signal):await operation;
 if(response.error)throw Error(response.error.message||'تعذر تنفيذ الطلب');
 return response.data;
}
async function authorize(){
 // The server-side RPC checks auth.uid(), active_user and admin membership.
 return rpc('get_platform_activity_report',{p_period:'today'});
}
async function refreshBaseline(period=selectedScope){
 const current=await rpc('get_platform_activity_report',{p_period:period});
 baseline=current;
 const sum=current.summary||{},where=dialog?.querySelector('[data-spc-baseline]');
 if(!where)return current;
 where.replaceChildren();
 const cards=document.createElement('div');cards.className='spc-grid';
 cards.append(card('المستخدمون المرصودون',number(sum.users),'خلال الفترة المختارة'),
  card('جلسات الأجهزة',number(sum.sessions),'لا تعني جميعها التزامن الحقيقي'),
  card('الحركات المسجلة',number(sum.events),'قد تتضمن النقرات والتصفح'),
  card('نسبة الإخفاقات المرصودة',sum.failureRate==null?'غير متاح':sum.failureRate+'%','من الأحداث التي لها حالة نجاح/فشل'),
  card('زمن استجابة ٩٥٪ من المحاولات',formatMs(sum.p95Ms),'للأحداث التي لها زمن'),
  card('الإجراءات البطيئة',number(sum.slow),'أكثر من ثانيتين'));
 where.append(cards);
 const problem=(current.byAction||[]).filter(x=>Number(x.failures)>0||Number(x.p95_ms)>2000).slice(0,8);
 where.append(text('h4','أكثر المؤشرات احتياجًا للفحص'));
 if(problem.length)where.append(table(problem.map(x=>[
  window.SanabilArabicUI?.view(x.view_key)||'نافذة في النظام',window.SanabilArabicUI?.action(x.action_key)||'إجراء في النظام',number(x.events),number(x.failures),formatMs(x.p95_ms)
 ]),['النافذة','العملية','الأحداث','الإخفاقات','زمن ٩٥٪ من المحاولات']));
 else where.append(text('p','لم تظهر عمليات متعثرة في البيانات المتاحة، وهذا لا يثبت خلو المنصة من الأعطال.','spc-muted'));
 return current;
}
async function callMeasured(op,circle,date,signal){
 const start=performance.now();
 try{
  const data=await rpc(op.rpc,op.params(circle,date),signal);
  if(op.id==='dryrun'&&!(data?.ok===true&&data?.rolledBack===true))throw Error('لم يؤكد الخادم التراجع عن الكتابة.');
  if(op.id==='access'&&data?.allowed===false)throw Error('الجلسة غير متاحة وفق الصلاحيات/ضوابط اليوم.');
  if(op.id==='read'&&!Array.isArray(data))throw Error('البيانات المسترجعة غير متوقعة.');
  return {ok:true,ms:performance.now()-start,operation:op.id};
 }catch(e){return {ok:false,ms:performance.now()-start,operation:op.id,error:e?.name==='AbortError'?'أُلغي الطلب':String(e?.message||e).slice(0,120)};}
}
function scope(){
 const circle=dialog?.querySelector('[data-spc-circle]')?.value;
 const date=dialog?.querySelector('[data-spc-day]')?.value;
 if(!circle||!date)throw Error('اختر حلقة نشطة وتاريخًا للفحص.');
 return {circle,date};
}
function suggest(records,actual){
 const notes=[];
 if(actual?.summary?.failureRate>1)notes.push('سجلات التشغيل تظهر إخفاقات: ابدأ بمراجعة الدوال والأذونات الأكثر تعثرًا قبل أي توسع.');
 if(actual?.summary?.p95Ms>2000)notes.push('زمن استجابة ٩٥٪ من المحاولات في الاستخدام الحقيقي تجاوز ثانيتين: افحص الاستعلامات الأعلى كلفة والفهارس والتخزين المؤقت.');
 if(records.some(x=>x.stats.failures))notes.push('ظهرت أخطاء عند التزامن؛ قارن نوع الخطأ بصلاحيات RLS وسجلات API والحدود والتوقيت.');
 if(records.some(x=>x.stats.p95>2000))notes.push('ارتفع زمن الاستجابة تحت الحمل: اعمل على تقليل استعلامات القراءة والتكرار واختبر فهارس أيام خطط الطلاب والحصيلة.');
 if(records.some(x=>x.stats.p95>5000))notes.push('تجاوز زمن ٩٥٪ من المحاولات خمس ثوانٍ: أوقف الزيادة وراجع الاتصالات المتزامنة واستهلاك المعالج وذاكرة قاعدة البيانات.');
 if(!notes.length)notes.push('لم تظهر مشكلات في العينة التشخيصية؛ لا تعتمد إطلاق 100 حساب دون اختبار أدوار وحفظ ومزامنة مستقل.');
 notes.push('اختبر في بيئة معزولة حسابات فعلية لكل دور وحفظ حصيلة تجريبية مع التحقق من القراءة اللاحقة والتزامن وعدم فقد البيانات.');
 notes.push('راقب Supabase في وقت الاختبار: المعالج، الاتصالات، الاستعلامات البطيئة، أخطاء طلبات الشبكة، والحصص المستهلكة.');
 return notes;
}
function renderReport(){
 const parent=dialog?.querySelector('[data-spc-report]');if(!parent)return;parent.replaceChildren();
 if(!result){parent.append(text('p','لا يوجد تقرير اختبار حتى الآن.'));return}
 const {mode,records,createdAt,limits,baselineSummary}=result;
 parent.append(text('h3','تقرير كفاءة النظام — '+(mode==='load'?'اختبار الحمل التشخيصي':'الفحص الشامل')));
 parent.append(text('p','وقت التقرير: '+createdAt,'spc-muted'));
 parent.append(text('p',limits,'spc-alert'));
 if(records.length)parent.append(table(records.map(x=>[
  x.name,String(x.users||'—'),number(x.stats.attempts),number(x.stats.failures),
  formatMs(x.stats.p50),formatMs(x.stats.p95),String(x.stats.errorRate)+'%'
 ]),['الاختبار','الطلبات المتزامنة','العمليات','الإخفاقات','زمن نصف المحاولات','زمن ٩٥٪ من المحاولات','الإخفاق %']));
 const next=suggest(records,baselineSummary?{summary:baselineSummary}:baseline);
 parent.append(text('h4','التشخيص والحلول المقترحة'));
 next.forEach((s,i)=>parent.append(text('p',(i+1)+'. '+s)));
 const last=records.filter(x=>x.users>0).at(-1);
 if(last){
  const passed=records.filter(x=>x.users>0&&x.stats.attempts&&x.stats.failures===0&&x.stats.p95!==null&&x.stats.p95<=2000);
  const value=passed.length?Math.max(...passed.map(x=>x.users)):0;
  parent.append(text('p','أعلى مرحلة اجتازت شروط الاختبار التشخيصي: '+number(value)+' طلبًا متزامنًا. هذا ليس عددًا معتمدًا للمستخدمين الفعليين.','spc-alert'));
 }
}
function completedResult(mode,records){
 result={
  mode,createdAt:new Date().toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}),records,
  baselineSummary:baseline?.summary||null,
  limits:note,
  scope:{circle:scope().circle,date:scope().date},
  recommendations:suggest(records,baseline)
 };
 renderReport();
}
async function runSpecific(id){
 if(running)return;
 const chosen=OPERATIONS.find(x=>x.id===id);
 setBusy(true);
 try{
  await authorize();
  if(!chosen){await refreshBaseline();status('تم تحديث المؤشرات الفعلية لجميع الأجهزة.');return}
  const {circle,date}=scope();
  const signal=(controller=new AbortController()).signal;
  status('جارٍ فحص '+chosen.title+' على 5 محاولات حقيقية دون تعديل بيانات الطلاب.');
  const values=[];
  for(let i=0;i<5;i++){
   if(signal.aborted)break;
   const sample=await callMeasured(chosen,circle,date,signal);values.push(sample);
  }
  completedResult('specific',[{name:chosen.title,users:1,stats:stats(values)}]);
  status('اكتمل الفحص المتخصص: '+values.length+' محاولات.');
 }catch(e){status(e.message,true)}finally{controller=null;setBusy(false)}
}
async function runOverall(){
 if(running)return;setBusy(true);
 const records=[];
 try{
  await authorize();
  const {circle,date}=scope(),signal=(controller=new AbortController()).signal;
  status('1/4: قراءة مؤشرات الاستخدام الفعلي...');
  await refreshBaseline('today');
  for(let i=0;i<OPERATIONS.length;i++){
   if(signal.aborted)break;
   const op=OPERATIONS[i];status((i+2)+'/4: '+op.title);
   const samples=[];
   for(let j=0;j<5;j++){
    if(signal.aborted)break;samples.push(await callMeasured(op,circle,date,signal));
   }
   records.push({name:op.title,users:1,stats:stats(samples)});
  }
  completedResult('overall',records);
  status(signal.aborted?'أُوقف الفحص؛ التقرير يعرض ما تم إنجازه فقط.':'اكتمل الفحص الشامل للمؤشرات المتاحة.');
 }catch(e){if(records.length){completedResult('overall',records)}status('تعذر استكمال الفحص: '+e.message,true)}
 finally{controller=null;setBusy(false)}
}
async function runLoad(){
 if(running)return;
 const target=Number(dialog.querySelector('[data-spc-users]').value);
 if(![10,25,50,100].includes(target))return status('عدد المستخدمين الافتراضيين غير صالح.',true);
 if(target>=50&&!window.confirm('سيُرسل الاختبار دفعات من طلبات حقيقية ومتزامنة إلى قاعدة البيانات. لا يغير بيانات الطلاب لكنه قد يؤثر مؤقتًا في الاستجابة ويستهلك الحصة. يُفضّل التشغيل خارج أوقات عمل المعلمين. هل تتابع؟'))return;
 const records=[];
 setBusy(true);controller=new AbortController();
 try{
  await authorize();
  const {circle,date}=scope(),signal=controller.signal;
  const stages=STAGES.filter(n=>n<=target);
  const progress=dialog.querySelector('[data-spc-progress]');
  progress.hidden=false;progress.max=stages.length;progress.value=0;
  for(let phase=0;phase<stages.length;phase++){
   if(signal.aborted)break;
   const users=stages[phase],all=[];
   status('المرحلة '+(phase+1)+' من '+stages.length+': '+users+' طلبات متزامنة من جلسة واحدة — جاري القياس...');
   const workload=Array.from({length:users},(_,i)=>(async()=>{
    // Each synthetic stream exercises an authorized read, followed by an
    // explicitly rolled-back diagnostic write; not a real grade save.
    const read=OPERATIONS[i%2];const a=await callMeasured(read,circle,date,signal);
    all.push(a);
    if(signal.aborted||!a.ok)return;
    const b=await callMeasured(OPERATIONS[2],circle,date,signal);
    all.push(b);
   })());
   await Promise.all(workload);
   const metric=stats(all);
   records.push({name:'دفعة '+users+' مسارًا تشخيصيًا',users,stats:metric});
   progress.value=phase+1;
   completedResult('load',records);
   if(signal.aborted)break;
   // Break early rather than amplify a degraded production database.
   if(metric.errorRate>5||metric.p95>5000){
    status('أُوقفت الزيادة تلقائيًا لتدهور الأداء (أخطاء أعلى من 5٪ أو زمن استجابة ٩٥٪ من المحاولات أكثر من خمس ثوانٍ).',true);break;
   }
   if(phase<stages.length-1)await sleep(650);
  }
  if(!signal.aborted&&records.length===stages.length)
   status('اكتملت مراحل الحمل التشخيصي. راجع التقرير؛ عدد المسارات لا يمثل حسابات مستخدمين مستقلة.');
  else if(signal.aborted)status('أُوقف الاختبار بناءً على طلبك. احتُفظ بالنتائج التي اكتملت.');
 }catch(e){if(records.length)completedResult('load',records);status('تعذر استكمال اختبار الحمل: '+e.message,true)}
 finally{controller=null;setBusy(false)}
}
function exportFile(format){
 if(!result)return status('نفّذ اختبارًا أولًا.',true);
 const data={
  'نوع التقرير':result.mode==='load'?'اختبار الحمل':'فحص المؤشرات',
  'تاريخ التقرير':result.createdAt,
  'التوضيح':result.limits,
  'ملخص الاستخدام':result.baselineSummary?{'الحركات':result.baselineSummary.events,'المستخدمون':result.baselineSummary.users,'الجلسات':result.baselineSummary.sessions,'الإخفاقات':result.baselineSummary.failures,'نسبة الإخفاقات':result.baselineSummary.failureRate,'زمن ٩٥٪':result.baselineSummary.p95Ms}:null,
  'الاختبارات':result.records.map(r=>({
    'المؤشر':r.name,'المسارات المتزامنة':r.users,
    'المحاولات':r.stats.attempts,'النجاح':r.stats.successes,'الإخفاقات':r.stats.failures,
    'زمن النصف بالمللي ثانية':r.stats.p50,
    'زمن ٩٥٪ بالمللي ثانية':r.stats.p95,
    'نسبة الأخطاء':r.stats.errorRate
  })),
  'التوصيات':result.recommendations
 };
 const csv=()=>{
  const lines=[['الاختبار','المسارات المتزامنة','المحاولات','نجاح','إخفاق','الزمن الوسيط بالمللي ثانية','زمن ٩٥٪ بالمللي ثانية','الخطأ_%']];
  result.records.forEach(x=>lines.push([x.name,x.users||'',x.stats.attempts,x.stats.successes,x.stats.failures,x.stats.p50??'',x.stats.p95??'',x.stats.errorRate]));
  return '\ufeff'+lines.map(x=>x.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 };
 const blob=new Blob([format==='csv'?csv():JSON.stringify(data,null,2)],{type:format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='تقرير-كفاءة-سنابل-'+new Date().toISOString().slice(0,10)+'.'+format;
 a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function fillCircles(){
 const client=getClient();const {data,error}=await client.from('circles').select('id,name').eq('active',true).order('name').limit(150);
 if(error)throw Error('تعذر جلب الحلقات: '+error.message);
 circles=Array.isArray(data)?data:[];
 const select=dialog?.querySelector('[data-spc-circle]');
 if(!select)return;select.replaceChildren();
 circles.forEach(c=>{const opt=document.createElement('option');opt.value=c.id;opt.textContent=arabic(c.name);select.append(opt)});
 if(!circles.length){select.append(new Option('لا توجد حلقة متاحة',''));status('لا توجد حلقة ضمن نطاق الحساب. مؤشرات النشاط العام متاحة، ولكن اختبارات الجلسة تتطلب حلقة.',true)}
}
async function open(){
 if(dialog?.isConnected){dialog.showModal?.();return}
 style();
 dialog=document.createElement('dialog');dialog.className='spc-root';dialog.setAttribute('aria-label','قياس مؤشرات الأداء');
 dialog.innerHTML='<div class="spc-shell">'+
 '<header class="spc-top"><div><h2>قياس مؤشرات الأداء</h2><p>لوحة موحدة لمدير النظام: قياس شامل، فحوص متخصصة، وحمل تشخيصي متدرج</p></div><button class="spc-btn spc-no-print" type="button" data-spc-close>إغلاق</button></header>'+
 '<section class="spc-section"><h3>المؤشرات الفعلية لجميع الأجهزة</h3><div class="spc-settings spc-no-print"><label>فترة القياس<select data-spc-period><option value="live">آخر 15 دقيقة</option><option value="today" selected>اليوم</option><option value="week">آخر 7 أيام</option></select></label><button class="spc-btn" data-spc-refresh data-spc-start type="button">تحديث المؤشرات الحقيقية</button></div><div data-spc-baseline>جارٍ تحميل مؤشرات المنصة...</div></section>'+
 '<section class="spc-section"><h3>أيقونات الفحص المحدد أو الشامل</h3><div class="spc-settings spc-no-print"><label>الحلقة<select data-spc-circle></select></label><label>تاريخ الفحص<input data-spc-day type="date"></label></div>'+
 '<div class="spc-grid spc-no-print">'+
 '<div class="spc-card"><h3>الفحص الشامل</h3><p>سجلات الاستخدام + صلاحية الجلسة + قراءة المقررات + كتابة اختبارية متراجَع عنها.</p><button data-spc-start data-spc-overall class="spc-btn primary">قياس جميع المؤشرات المتاحة</button></div>'+
 '<div class="spc-card"><h3>قراءة المقررات</h3><p>قياس استعلام مقررات الحلقة.</p><button data-spc-start data-spc-specific="read" class="spc-btn">بدء الفحص</button></div>'+
 '<div class="spc-card"><h3>الصلاحيات</h3><p>التحقق من السماح بفتح الجلسة.</p><button data-spc-start data-spc-specific="access" class="spc-btn">بدء الفحص</button></div>'+
 '<div class="spc-card"><h3>الحفظ التجريبي</h3><p>كتابة تشخيصية تُلغى آليًا؛ لا تحفظ حصيلة.</p><button data-spc-start data-spc-specific="dryrun" class="spc-btn">بدء الفحص</button></div></div></section>'+
 '<section class="spc-section"><h3>اختبار الضغط المتزامن التدريجي</h3><p class="spc-alert">'+note+'</p>'+
 '<div class="spc-settings spc-no-print"><label>الحد المستهدف للمسارات الافتراضية<select data-spc-users><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>'+
 '<button data-spc-start data-spc-load class="spc-btn primary">تشغيل الحمل المتدرج</button>'+
 '<button data-spc-stop class="spc-btn" disabled>إيقاف الاختبار</button></div>'+
 '<progress data-spc-progress class="spc-progress" hidden max="1" value="0"></progress>'+
 '<p class="spc-muted">تبدأ المراحل من 1 و5 و10 ثم 25 و50 و100 بحسب الهدف، مع إيقاف تلقائي عند ارتفاع الأخطاء أو تباطؤ ٩٥٪ من المحاولات. الاستخدام التشخيصي فقط؛ اختبارات أدوار 100 حساب حقيقي تتطلب بيئة اختبار مستقلة.</p></section>'+
 '<section class="spc-section"><h3>التشخيص وتقرير الكفاءة</h3><p data-spc-status class="spc-status" role="status" aria-live="polite"></p><div data-spc-report class="spc-report"></div>'+
 '<div class="spc-actions spc-no-print"><button data-spc-json class="spc-btn">تصدير التقرير المفصل</button><button data-spc-csv class="spc-btn">تصدير جدول بيانات</button><button data-spc-print class="spc-btn">طباعة أو حفظ مستند</button></div></section>'+
 '</div>';
 document.body.append(dialog);
 dialog.querySelector('[data-spc-day]').value=dateRiyadh();
 dialog.querySelector('[data-spc-close]').onclick=()=>{if(running){status('أوقف الاختبار أولًا قبل إغلاق الصفحة.',true);return}dialog.close()};
 dialog.addEventListener('close',()=>{if(controller)controller.abort();controller=null;running=false;dialog.remove();dialog=null},{once:true});
 dialog.querySelector('[data-spc-period]').onchange=e=>{selectedScope=e.target.value;refreshBaseline(selectedScope).catch(error=>status(error.message,true))};
 dialog.querySelector('[data-spc-refresh]').onclick=()=>refreshBaseline(selectedScope).then(()=>status('تم تحديث مؤشرات جميع الأجهزة.')).catch(e=>status(e.message,true));
 dialog.querySelector('[data-spc-overall]').onclick=runOverall;
 dialog.querySelectorAll('[data-spc-specific]').forEach(b=>b.onclick=()=>runSpecific(b.dataset.spcSpecific));
 dialog.querySelector('[data-spc-load]').onclick=runLoad;
 dialog.querySelector('[data-spc-stop]').onclick=()=>{controller?.abort();status('جارٍ إيقاف الاختبار...')};
 dialog.querySelector('[data-spc-json]').onclick=()=>exportFile('json');
 dialog.querySelector('[data-spc-csv]').onclick=()=>exportFile('csv');
 dialog.querySelector('[data-spc-print]').onclick=()=>window.print();
 dialog.showModal();
 dialog.querySelectorAll('[data-spc-start]').forEach(el=>el.disabled=true);
 result=null;baseline=null;renderReport();status('جارٍ التحقق من صلاحية مدير النظام وجلب البيانات.');
 try{
  await authorize();
  await Promise.all([fillCircles(),refreshBaseline('today')]);
  dialog.querySelectorAll('[data-spc-start]').forEach(el=>el.disabled=false);
  status('جاهز. اختر الفحص المطلوب. يجب إجراء اختبارات الحمل المرتفع خارج وقت عمل الحلقات.');
 }catch(e){
  status('تعذر فتح مختبر الأداء: '+e.message,true);
  dialog.querySelectorAll('[data-spc-start]').forEach(el=>el.disabled=true);
 }
}
window.SanabilPerformanceCenter={open,percentile,stats,stages:STAGES.slice(),version:VERSION};
})();