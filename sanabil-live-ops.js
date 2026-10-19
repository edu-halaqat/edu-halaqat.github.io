/* Real-session, non-identifying operational timings and supervisor read-only monitor. */
(()=>{'use strict';if(window.SanabilLiveOps)return;
 const client=()=>window.supabaseClient;
 const textNode=(tag,text,className)=>{const x=document.createElement(tag);x.textContent=text||'';if(className)x.className=className;return x};
 const button=(label,fn)=>{const b=textNode('button',label,'button');b.type='button';b.addEventListener('click',fn);return b};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const percentile=(values,p)=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.max(0,Math.ceil(v.length*p)-1)]:null};
 const statusValue=n=>n===null?'—':n+' مللي ثانية';
 function record(circleId,operation,duration,success=true){
  if(!client()||!navigator.onLine||!circleId||!Number.isFinite(duration))return;
  client().rpc('record_circle_operation_sample',{
   p_circle_id:circleId,p_operation:operation,p_duration_ms:Math.max(0,Math.min(120000,Math.round(duration))),
   p_succeeded:!!success
  }).then(({error})=>{if(error)console.warn('تعذر حفظ مؤشر الأداء الحي:',error.message)})
    .catch(()=>{});
 }
 function mountDashboard(root,a){
  if(!a?.roles?.some(r=>['manager','supervisor','admin'].includes(r)))return;
  const toolbar=root.querySelector('.sl-dashboard-actions');
  if(!toolbar||toolbar.querySelector('[data-live-ops]'))return;
  const btn=button('◷ مؤشرات أداء الحلقات المباشرة',()=>open(a));
  btn.dataset.liveOps='1';toolbar.append(btn);
 }
 async function open(a){
  const d=document.createElement('dialog');d.className='sl-liveops-dialog';d.dir='rtl';
  const heading=textNode('h2','مراقبة أداء الحلقات · بيانات مباشرة');
  const note=textNode('p','المؤشرات من حفظ الخادم وسجل الحضور. تُحدّث كل 15 ثانية أثناء فتح النافذة فقط، ولا تحتوي أسماء الطلاب أو درجاتهم. سرعة الحفظ مأخوذة من قياسات أجهزة المعلمين بعد التحقق من نجاح الحفظ.','sl-liveops-note');
  const filters=document.createElement('div');filters.className='sl-liveops-filters';
  const selector=document.createElement('select');selector.setAttribute('aria-label','اختيار المجمع');
  const refresh=button('تحديث الآن',()=>load());
  const close=button('إغلاق',()=>d.close());filters.append(selector,refresh);
  const result=textNode('div','جارٍ تحميل مؤشرات الحلقات…','sl-liveops-result');
  d.append(heading,note,filters,result,close);
  document.body.append(d);
  let timer=null,busy=false;
  d.addEventListener('close',()=>{if(timer)clearInterval(timer);d.remove()},{once:true});
  d.showModal?.();
  const activeScope=(a.complexIds||[]).filter(Boolean);
  const query=client().from('complexes').select('id,name').eq('active',true);
  const {data:complexes,error}=await(a.roles.includes('admin')?query.eq('org_id',a.org_id):
    activeScope.length?query.in('id',activeScope):Promise.resolve({data:[],error:null}));
  if(error){result.textContent='تعذر عرض المجمعات: '+error.message;return}
  if(!complexes?.length){result.textContent='لا توجد مجمعات ضمن صلاحيتك.';return}
  for(const c of complexes){const opt=textNode('option',c.name);opt.value=c.id;selector.append(opt)}
  selector.addEventListener('change',()=>load());
  async function load(){
   if(busy||!d.isConnected||document.visibilityState==='hidden')return;
   busy=true;refresh.disabled=true;const complex=selector.value;
   const recent=new Date(Date.now()-3600000).toISOString();
   try{
    const [circles,students,attendance,outcomes,samples]=await Promise.all([
     client().from('circles').select('id,name').eq('complex_id',complex).eq('active',true).limit(150),
     client().from('students').select('id,circle_id').eq('complex_id',complex).eq('active',true).limit(3000),
     client().from('student_attendance').select('circle_id,student_id,status').eq('complex_id',complex).eq('date_key',today()).limit(4000),
     client().from('outcomes').select('circle_id,student_id,updated_at').eq('complex_id',complex).eq('date_key',today()).limit(4000),
     client().from('circle_operation_samples').select('circle_id,operation,duration_ms,succeeded,observed_at').eq('complex_id',complex).gte('observed_at',recent).order('observed_at',{ascending:false}).limit(2000)
    ]);
    for(const r of [circles,students,attendance,outcomes,samples])if(r.error)throw r.error;
    result.replaceChildren();
    const savedIds=new Set((outcomes.data||[]).map(o=>o.student_id));
    const attendedIds=new Set((attendance.data||[]).map(o=>o.student_id));
    const allTimings=(samples.data||[]).filter(x=>x.operation==='outcome_save'&&x.succeeded).map(x=>x.duration_ms);
    const p95=percentile(allTimings,.95);
    const top=document.createElement('section');top.className='sl-liveops-summary';
    for(const [key,value] of [
     ['الحصائل المحفوظة اليوم',savedIds.size],['التحضير المحفوظ اليوم',attendedIds.size],
     ['عينات سرعة الحفظ في الساعة الماضية',allTimings.length],['زمن حفظ P95',statusValue(p95)]
    ]){
     const box=textNode('article','','sl-liveops-stat');
     box.append(textNode('small',key),textNode('strong',String(value)));top.append(box);
    }result.append(top);
    const table=document.createElement('div');table.className='sl-liveops-rows';
    for(const c of circles.data||[]){
     const studentTotal=(students.data||[]).filter(x=>x.circle_id===c.id).length;
     const done=(outcomes.data||[]).filter(x=>x.circle_id===c.id).length;
     const attendanceDone=(attendance.data||[]).filter(x=>x.circle_id===c.id).length;
     const m=(samples.data||[]).filter(x=>x.circle_id===c.id&&x.operation==='outcome_save'&&x.succeeded);
     const row=textNode('article','','sl-liveops-row');
     row.append(textNode('strong',c.name),textNode('span','حصائل '+done+'/'+studentTotal),
       textNode('span','تحضير '+attendanceDone+'/'+studentTotal),
       textNode('span','P95 '+statusValue(percentile(m.map(v=>v.duration_ms),.95))));
     table.append(row);
    }
    result.append(table);
    result.append(textNode('small','آخر تحديث: '+new Date().toLocaleTimeString('ar-SA')+
      ' · لا يعني غياب العينة سرعة صفرًا. هذه قياسات عمليات محفوظة ومؤكدة فقط.','sl-liveops-note'));
   }catch(e){result.textContent='تعذر تحميل المؤشرات: '+(e.message||'أعد المحاولة')}
   finally{busy=false;refresh.disabled=false}
  }
  await load();timer=setInterval(load,15000);
 }
 window.SanabilLiveOps={record,mountDashboard,open,percentile};
})();