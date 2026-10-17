/* 20-round, non-mutating live session performance diagnostic.
   Runs on the current device/network; no student writes, no local-cache shortcuts.
   Educational save is NOT exercised: an isolated server INSERT rolls back.
*/
(()=>{'use strict';if(window.SanabilDeepPerformance)return;
const ITERATIONS=20;
const now=()=>performance.now();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentiles=values=>{
 const sorted=values.slice().sort((a,b)=>a-b),n=sorted.length;
 return {count:n,mean:n?sorted.reduce((a,b)=>a+b,0)/n:null,
  p95:n?sorted[Math.ceil(n*.95)-1]:null,max:n?sorted[n-1]:null,
  under2s:n?Math.round(100*sorted.filter(x=>x<2000).length/n):null};
};
const tag=(name,text)=>{const element=document.createElement(name);element.textContent=String(text??'');return element};
const cancelled=signal=>{if(signal?.aborted)throw new DOMException('أُلغي الاختبار','AbortError')};
function renderDiagnosticCards(students){
 // An isolated sample: never touches visible assessment inputs or attendance.
 const holder=document.createElement('div');
 const fragment=document.createDocumentFragment();
 const cards=[];
 for(const student of students){
  const card=tag('article',student.fullName||'طالب');card.hidden=true;
  fragment.appendChild(card);cards.push(card);
 }
 holder.appendChild(fragment);
 return cards;
}
function measureStudentSwitch(students,signal){
 if(!students.length)return null;
 const cards=renderDiagnosticCards(students),n=Math.min(20,cards.length);
 const start=now();
 for(let i=0;i<n;i++){
  cancelled(signal);
  const current=cards[i];
  current.hidden=false;
  // Simulate the inexpensive local focus/filter portion, not a full outcomes UI rerender.
  current.setAttribute('aria-current','true');
  current.removeAttribute('aria-current');
  current.hidden=true;
 }
 return (now()-start)/n;
}
async function run({circleId,date,signal,onUpdate=()=>{},rounds=ITERATIONS}={}){
 if(!circleId||!date)throw Error('اختر الحلقة والتاريخ أولًا.');
 if(!navigator.onLine)throw Error('الاختبار الموسع يحتاج اتصالًا مباشرًا بالإنترنت.');
 if(!Number.isInteger(rounds)||rounds<1||rounds>ITERATIONS)throw Error('عدد المحاولات غير صالح.');
 const client=window.supabaseClient;
 if(!client)throw Error('لم يجهز الاتصال بالسحابة.');
 const samples={open:[],switch:[],write:[]},errors={open:0,switch:0,write:0};
 const startsAt=new Date().toISOString();
 const args={p_circle_id:circleId,p_date:date};
 let cancelledEarly=false,lastError='',complete=0,readOnly=false;
 const getRpc=async(name,args,requestSignal)=>{
  const response=await client.rpc(name,args).abortSignal(requestSignal);
  if(response.error)throw Error(name+': '+response.error.message);
  return response.data;
 };
 const getAbsence=async requestSignal=>{
  const response=await client.from('student_attendance').select('student_id,absence_reason')
    .eq('circle_id',circleId).eq('date_key',date).abortSignal(requestSignal);
  if(response.error)throw Error('أسباب الغياب: '+response.error.message);
  return response.data;
 };
 for(let i=0;i<rounds;i++){
  if(signal?.aborted){cancelledEarly=true;break}
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const start=now();
   const [permission,dayType,assignments,excuses,absences]=await Promise.all([
    getRpc('circle_session_access',args,controller.signal),
    getRpc('get_day_types_guarded',args,controller.signal),
    getRpc('get_daily_assignments',args,controller.signal),
    getRpc('get_guardian_excuses_for_circle_guarded',args,controller.signal),
    getAbsence(controller.signal)
   ]);
   cancelled(signal);
   // Fetch + build a detached diagnostic student listing as a stable, comparable
   // load proxy. It is NOT timing the full daily outcomes page painting.
   const students=Array.isArray(assignments)?assignments:[];
   const view=renderDiagnosticCards(students);
   if(!view||!dayType||!Array.isArray(excuses)||!Array.isArray(absences))throw Error('مخرجات الجلسة غير متوقعة.');
   samples.open.push(now()-start);
   readOnly=readOnly||permission?.allowed===false;
   try{const switchMs=measureStudentSwitch(students,signal);
    if(switchMs!==null)samples.switch.push(switchMs);
   }catch(error){if(error?.name==='AbortError')throw error;errors.switch++;lastError=error.message;}
  }catch(error){
   if(signal?.aborted){cancelledEarly=true;break}
   errors.open++;lastError=error?.message||String(error);
  }finally{
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
  }
  if(signal?.aborted){cancelledEarly=true;break}
  // Separate write test: an authenticated diagnostic row rolled back by server.
  // It cannot alter student attendance, grades, or plans.
  const writeController=new AbortController(),abortWrite=()=>writeController.abort();
  signal?.addEventListener('abort',abortWrite,{once:true});
  const writeTimeout=setTimeout(()=>writeController.abort(),15000),beginWrite=now();
  try{
   const response=await getRpc('sanabil_performance_save_dryrun',
    {p_circle_id:circleId},writeController.signal);
   cancelled(signal);
   if(response?.ok!==true||response?.rolledBack!==true||response?.mode!=='isolated_diagnostic_write')
    throw Error('لم يؤكد الخادم إلغاء العملية التجريبية.');
   samples.write.push(now()-beginWrite);
  }catch(error){
   if(signal?.aborted){cancelledEarly=true;break}
   errors.write++;lastError=error?.message||String(error);
  }finally{
   clearTimeout(writeTimeout);signal?.removeEventListener('abort',abortWrite);
  }
  complete++;
  const snapshot={
   rounds:complete,total:rounds,metrics:{
    open:{...percentiles(samples.open),errors:errors.open},
    switch:{...percentiles(samples.switch),errors:errors.switch},
    write:{...percentiles(samples.write),errors:errors.write}
   },lastError,readOnly,cancelled:cancelledEarly
  };
  onUpdate(snapshot);
  if(i<rounds-1)await delay(80);
 }
 return {
  rounds:complete,total:rounds,metrics:{
   open:{...percentiles(samples.open),errors:errors.open},
   switch:{...percentiles(samples.switch),errors:errors.switch},
   write:{...percentiles(samples.write),errors:errors.write}
  },lastError,readOnly,cancelled:cancelledEarly,
  client:{platform:/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)?'جوال أو تابلت':'كمبيوتر',
   online:navigator.onLine,network:navigator.connection?.effectiveType||'غير متاح'},
  startedAt:startsAt,endedAt:new Date().toISOString(),
  notes:'فتح الجلسة: طلبات حقيقية + قائمة تشخيصية، لا تشمل رسم الحصيلة الكامل. الانتقال: محاكاة محلية. الحفظ: كتابة تشخيصية يتم إلغاؤها ولا تحفظ حصيلة طالب.'
 };
}
window.SanabilDeepPerformance={run,percentiles};
})();