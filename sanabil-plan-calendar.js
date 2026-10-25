/* Sanabil academic calendar, Madinah: approved school year 1448-1449 only.
   Later reference windows require independent approval and are not defaults.
   Explicit changes use audited, scoped RPCs; no silent rewriting of plans. */
(()=>{'use strict';if(window.SanabilPlanCalendar)return;
const source='https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx';
const regionReference='https://saudicalendars.com/academic-calendar/';
const verified=[
 ['2026-09-23','2026-09-26','إجازة اليوم الوطني'],
 ['2026-10-25','2026-10-25','إجازة إضافية للمدينة المنورة'],
 ['2026-11-20','2026-11-28','إجازة الخريف'],
 ['2027-01-08','2027-01-16','إجازة منتصف العام'],
 ['2027-02-19','2027-02-22','إجازة يوم التأسيس'],
 ['2027-02-26','2027-03-13','إجازة عيد الفطر'],
 ['2027-04-30','2027-05-22','إجازة عيد الأضحى للمدينة المنورة']
];
const laterReferences=[
 // 1449–1450 / 2027–2028: reference, pending official confirmation.
 ['2027-09-23','2027-09-23','إجازة اليوم الوطني'],
 ['2027-11-19','2027-11-27','إجازة الخريف'],
 ['2028-01-07','2028-01-15','إجازة منتصف العام'],
 ['2028-02-18','2028-03-04','إجازة عيد الفطر'],
 ['2028-04-21','2028-05-13','إجازة عيد الأضحى للمدينة المنورة'],
 // 1450–1451 / 2028–2029: region-specific autumn, spring and Eid dates.
 ['2028-09-24','2028-09-24','إجازة اليوم الوطني'],
 ['2028-11-24','2028-12-02','إجازة الخريف للمدينة المنورة'],
 ['2029-01-05','2029-01-13','إجازة منتصف العام'],
 ['2029-02-02','2029-02-24','إجازة عيد الفطر'],
 ['2029-03-23','2029-03-31','إجازة الربيع للمدينة المنورة'],
 ['2029-04-13','2029-04-29','إجازة عيد الأضحى للمدينة المنورة']
];
const kinds={holiday:'إجازة',study:'يوم دراسي',test:'يوم اختبار',unaccounted:'غير محتسب',default:'العودة للتقويم الافتراضي'};
const pad=x=>String(x).padStart(2,'0');
const iso=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
const weekdayNames=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const calcOfficial=d=>verified.find(([start,end])=>d>=start&&d<=end)?.[2]||'';
const calcReference=d=>laterReferences.find(([start,end])=>d>=start&&d<=end)?.[2]||'';
const dayTypeFrom=event=>event?'holiday':'study';
function make(tag,label,cl){
 const node=document.createElement(tag);
 if(label!==undefined)node.textContent=label;
 if(cl)node.className=cl;return node;
}
const style=()=>{if(document.getElementById('sl-calendar-style'))return;
 const e=make('style');e.id='sl-calendar-style';e.textContent=[
 '.sl-academic-cal{width:min(1050px,95vw);max-height:92dvh;overflow-y:auto;box-sizing:border-box;padding:18px;color:var(--ink,#193b32);background:var(--surface,#fff);border:1px solid #9ebdad;border-radius:16px;direction:rtl}',
 '.sl-academic-cal::backdrop{background:#0b231cc7}',
 '.sl-academic-cal *{box-sizing:border-box;min-width:0}',
 '.sl-academic-head{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:start}',
 '.sl-academic-head h2{margin:0}.sl-academic-muted{line-height:1.8;font-size:.87rem;opacity:.85}',
 '.sl-academic-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:10px;padding:12px 0}',
 '.sl-academic-toolbar label,.sl-academic-detail label{display:flex;flex-direction:column;gap:5px}',
 '.sl-academic-toolbar select,.sl-academic-detail select{padding:9px;max-width:100%;border-radius:9px;border:1px solid #92ad9f;color:inherit;background:transparent;font:inherit}',
 '.sl-academic-toolbar button,.sl-academic-detail button,.sl-academic-head button{border:1px solid #7f9d92;padding:10px;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}',
 '.sl-academic-toolbar{isolation:isolate;position:relative;z-index:1}',
 '.sl-calendar-month-button{touch-action:manipulation;position:relative;z-index:2;min-height:44px;min-width:105px}',
 '.sl-calendar-source-note{pointer-events:none;user-select:text;position:relative;z-index:0}',
 '.sl-academic-week,.sl-academic-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}',
 '.sl-academic-week>div{text-align:center;font-weight:700;font-size:.78rem;padding:7px 0}',
 '.sl-academic-day{border:1px solid #99b6a6;border-radius:9px;min-height:66px;padding:5px;display:flex;flex-direction:column;align-items:center;gap:4px;color:inherit;background:transparent;font:inherit;cursor:pointer}',
 '.sl-academic-day strong{font-size:1rem}.sl-academic-day small{font-size:.67rem;text-align:center;overflow-wrap:anywhere;line-height:1.2}',
 '.sl-academic-day.is-official{background:#d2eddd;color:#14573c}.sl-academic-day.is-pending{background:#f7ead1;color:#705112}.sl-academic-day.is-changed{outline:2px solid #238c78}',
 '.sl-academic-day[aria-pressed=true]{outline:3px solid #a57b2e}',
 '.sl-academic-day.is-selected{box-shadow:inset 0 0 0 3px #23866e;background:#d7ede1;color:#134c37}',
 '.sl-cal-select{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;align-items:end}',
 '.sl-cal-select label{flex:1;min-width:min(170px,100%)}',
 '.sl-cal-select input{padding:9px;border:1px solid #92ad9f;border-radius:9px;font:inherit;background:transparent;color:inherit;max-width:100%;width:100%}',
 '.sl-cal-selection-count{font-weight:700;margin:10px 0}',
 '.sl-academic-day:disabled{opacity:.25;cursor:auto}.sl-academic-detail{margin-top:14px;border:1px solid #93b4a5;border-radius:12px;padding:14px}',
 '.sl-academic-circles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:7px;margin:12px 0}',
 '.sl-academic-circles label{display:flex;gap:6px;align-items:center;font-size:.85rem}',
 '.sl-academic-state{min-height:25px;white-space:pre-wrap;line-height:1.7}',
 '.sl-complex-group{border:1px solid #a8c2b6;padding:11px;margin:10px 0;border-radius:12px}',
 '.sl-complex-group>summary{cursor:pointer;font-weight:700;margin-bottom:9px}',
 '.sl-complex-select{display:flex!important;flex-direction:row!important;align-items:center;gap:9px;font-weight:700}',
 '.sl-complex-select input,.sl-academic-circles input{width:18px;height:18px;flex:none;accent-color:#188068}',
 '.sl-academic-bulkbar{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}',
 '.sl-academic-progress{width:100%;accent-color:#188068;height:12px;margin:9px 0}',
 '.sl-calendar-breakdown{margin:10px 0;padding:10px;border:1px solid #c2d4ca;border-radius:12px;white-space:pre-wrap;line-height:1.8}',
 '.sl-calendar-error{color:#a83e32;white-space:pre-wrap;overflow-wrap:anywhere}',
 '.sl-academic-detail button:disabled,.sl-academic-head button:disabled{opacity:.55;cursor:not-allowed}',
 '@media(max-width:650px){.sl-academic-cal{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;padding:11px}.sl-academic-day{min-height:56px;padding:3px}.sl-academic-day small{font-size:.59rem}.sl-academic-week>div{font-size:.68rem}}'
 ].join('\n');document.head.append(e);
};
async function open({selectedCircle}={}){
 const client=window.supabaseClient;
 if(!client)throw Error('تعذر الاتصال بالخادم.');
 const {data:scope,error:scopeError}=await client.rpc('get_calendar_management_scope_guarded');
 if(scopeError)throw Error('تعذر جلب المجمعات والحلقات المخولة: '+scopeError.message);
 if(!Array.isArray(scope)||!scope.length)throw Error('لا توجد مجمعات مخولة لهذا الحساب.');
 // Privileged scope is server-derived. The old plans-page circle list was
 // incomplete for administrators managing several complexes.
 const authorized=scope.filter(g=>Array.isArray(g.circles)&&g.circles.length);
 const circles=authorized.flatMap(g=>g.circles.map(c=>({...c,complexId:g.id,complexName:g.name})));
 if(!circles.length)throw Error('لا توجد حلقات نشطة في المجمعات المتاحة.');
 style();const dialog=make('dialog');dialog.className='sl-academic-cal';
 const header=make('header',undefined,'sl-academic-head');
 const introduction=make('div');
 introduction.append(make('h2','أيام الإجازة والتقويم التعليمي'),
  make('p','التصنيف حسب المجمع ثم حلقاته، مع استثناء الإجازة الصيفية من تعطيل الحلقات.','sl-academic-muted'));
 const close=make('button','إغلاق');close.type='button';
 header.append(introduction,close);dialog.append(header);
 const note=make('p','التقويم الدراسي ١٤٤٨–١٤٤٩ للمدينة المنورة هو المرجع المعتمد. تظهر تواريخ الأعوام اللاحقة بصفة مرجعية حتى تُعتمد. اختيار موعد مرجعي لا يُغير الخطط دون إجراء الحفظ.','sl-academic-muted');
 dialog.append(note);
 // Source names are context, not touch targets. External anchors above the
 // month arrows caused unintended mobile navigation to the reference website.
 // Keep this dialog completely self-contained (and free of external links).
 const sources=make('p','مصادر التواريخ: تقويم وزارة التعليم، وتقويم السعودية مرجعًا للأعوام اللاحقة.','sl-academic-muted');
 sources.classList.add('sl-calendar-source-note');
 dialog.append(sources);
 const toolbar=make('div',undefined,'sl-academic-toolbar');
 const previous=make('button','الشهر السابق'),next=make('button','الشهر التالي'),monthLabel=make('strong');
 previous.type='button';next.type='button';
 previous.setAttribute('aria-label','الانتقال إلى الشهر السابق');
 next.setAttribute('aria-label','الانتقال إلى الشهر التالي');
 previous.classList.add('sl-calendar-month-button');
 next.classList.add('sl-calendar-month-button');
 toolbar.append(previous,monthLabel,next);dialog.append(toolbar);
 const week=make('div',undefined,'sl-academic-week');
 weekdayNames.forEach(x=>week.append(make('div',x)));dialog.append(week);
 const grid=make('div',undefined,'sl-academic-days');dialog.append(grid);
 const detail=make('section',undefined,'sl-academic-detail');dialog.append(detail);
 const state=make('p','', 'sl-academic-state');state.setAttribute('role','status');
 state.setAttribute('aria-live','polite');
 const now=new Date();
 let year=now.getFullYear(),month=now.getMonth()+1,selectedDay='';
 let overrides=new Map(),running=false,cancelled=false,lastReport='',lastBreakdown='';
 let selectionMode='single',selectionDates=new Set(),rangeStart='',rangeEnd='',weekStart='',weekCount=1;
 const monthlyCache=new Map();let renderSequence=0;
 const checked=new Set(selectedCircle&&circles.some(c=>c.id===selectedCircle)?[selectedCircle]:[]);
 const findCircle=id=>circles.find(c=>c.id===id);
 const explainError=e=>{
  const raw=String(e?.message||e||'تعذر تنفيذ الطلب.');
  if(/57014|statement.timeout|canceling.statement/i.test(raw))
   return 'استغرق ترحيل مقررات الطالب أكثر من المهلة المسموحة. بقيت الحلقة غير مكتملة ويمكن استئنافها بعد معالجة بطء الخطط.';
  if(/42501|permission.denied|unauthorized|forbidden/i.test(raw))
   return 'رفض الخادم العملية لعدم كفاية صلاحيات هذا الحساب على الحلقة.';
  if(/network|failed.to.fetch|connection|gateway.timeout/i.test(raw))
   return 'تعذر الاتصال بالخادم أثناء الحفظ. تحقق من الاتصال ثم أعد تشغيل اعتماد الحلقة لاستئناف ما لم يكتمل.';
  return /[A-Za-z]/.test(raw)?'رفض الخادم تنفيذ هذا الجزء من العمل. راجع سجل الأخطاء التقني لمعرفة السبب التفصيلي.':raw;
 };
 const message=s=>{lastReport=String(s);state.textContent=lastReport};
 close.onclick=()=>{if(running){cancelled=true;message('طلب إيقاف التنفيذ. سيكتمل الطلب الجاري ثم يمكنك إغلاق التقويم.');return}dialog.close()};
 async function fetchOverrides(y=year,m=month){
  const key=iso(y,m,1);
  if(monthlyCache.has(key))return monthlyCache.get(key);
  const first=key,last=iso(y,m,new Date(Date.UTC(y,m,0)).getUTCDate());
  // One scoped query per unvisited month. Cached navigation is immediate.
  const {data,error}=await client.rpc('get_circle_day_types_range_guarded',
   {p_circle_ids:circles.map(c=>c.id),p_from:first,p_to:last});
  if(error)throw Error(error.message||'تعذر قراءة التصنيفات المحفوظة.');
  const latest=new Map();
  for(const item of data||[])latest.set(item.circleId+'|'+item.date,item.type);
  monthlyCache.set(key,latest);
  return latest;
 }
 const classify=date=>{
  const values=[...checked].map(id=>overrides.get(id+'|'+date)).filter(Boolean);
  return values.length&&new Set(values).size===1?values[0]:dayTypeFrom(calcOfficial(date));
 };
 function drawChoices(container){
  container.replaceChildren();
  const bar=make('div',undefined,'sl-academic-bulkbar');
  const all=make('button','تحديد جميع المجمعات'),clear=make('button','إلغاء التحديد');
  all.type=clear.type='button';
  all.onclick=()=>{for(const c of circles)checked.add(c.id);drawChoices(container)};
  clear.onclick=()=>{checked.clear();drawChoices(container)};
  bar.append(all,clear);container.append(bar);
  for(const complex of authorized){
   const group=make('details',undefined,'sl-complex-group');group.open=true;
   const heading=make('summary',complex.name+' — '+complex.circles.length+' حلقات');
   group.append(heading);
   const top=make('label',undefined,'sl-complex-select'),master=make('input');
   master.type='checkbox';
   const ids=complex.circles.map(c=>c.id);
   master.checked=ids.every(id=>checked.has(id));
   master.indeterminate=!master.checked&&ids.some(id=>checked.has(id));
   master.setAttribute('aria-label','تحديد جميع حلقات '+complex.name);
   master.onchange=()=>{for(const id of ids)master.checked?checked.add(id):checked.delete(id);drawChoices(container)};
   top.append(master,make('span','جميع حلقات مجمع '+complex.name));
   group.append(top);
   const box=make('div',undefined,'sl-academic-circles');
   for(const c of complex.circles){
    const label=make('label'),checkbox=make('input');
    checkbox.type='checkbox';checkbox.checked=checked.has(c.id);
    checkbox.onchange=()=>{checkbox.checked?checked.add(c.id):checked.delete(c.id);drawChoices(container)};
    label.append(checkbox,make('span',c.name));box.append(label);
   }
   group.append(box);container.append(group);
  }
  container.append(make('p','الحلقات المحددة: '+checked.size+' من '+circles.length,'sl-academic-muted'));
 }
 const addDays=(first,count)=>{
  if(!first||!Number.isInteger(count)||count<1||count>120)throw Error('حدّد تاريخًا وعددًا من الأيام لا يتجاوز ١٢٠ يومًا.');
  const base=new Date(first+'T12:00:00Z');
  if(Number.isNaN(base.getTime()))throw Error('تاريخ البداية غير صحيح.');
  return Array.from({length:count},(_,i)=>{
   const d=new Date(base.getTime()+i*86400000);
   return iso(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
  });
 };
 const selectedDatesForAction=()=>{
  if(selectionMode==='single')return selectedDay?[selectedDay]:[];
  if(selectionMode==='multiple')return [...selectionDates].sort();
  if(selectionMode==='range'){
   if(!rangeStart||!rangeEnd||rangeStart>rangeEnd)throw Error('حدد تاريخ البداية والنهاية بترتيب صحيح.');
   const length=Math.round((Date.parse(rangeEnd+'T12:00:00Z')-Date.parse(rangeStart+'T12:00:00Z'))/86400000)+1;
   return addDays(rangeStart,length);
  }
  if(selectionMode==='weeks')return addDays(weekStart,weekCount*7);
  return [];
 };
 function renderDetail(){
  detail.replaceChildren();
  detail.append(make('h3',selectedDay?'تحديد الأيام ابتداء من '+selectedDay:'حدد الأيام من التقويم'));
  const official=calcOfficial(selectedDay),pending=calcReference(selectedDay);
  detail.append(make('p',official?'إجازة رسمية افتراضية: '+official:
    pending?'موعد مرجعي للأعوام غير المعتمدة: '+pending:
    'الإجازات الدراسية المعتمدة مطبقة افتراضيًا؛ تعديل المشرف يتقدم عليها.','sl-academic-muted'));
  const modeLabel=make('label','طريقة تحديد الأيام'),mode=make('select');
  for(const [key,label] of Object.entries({
   single:'يوم واحد',multiple:'أيام متفرقة بالضغط على التقويم',
   range:'فترة بين تاريخين',weeks:'أسابيع متتالية'
  })){
   const opt=make('option',label);opt.value=key;mode.append(opt);
  }
  mode.value=selectionMode;
  mode.onchange=()=>{
   selectionMode=mode.value;
   if(selectionMode==='multiple'&&selectedDay&&!selectionDates.size)selectionDates.add(selectedDay);
   if(!rangeStart)rangeStart=selectedDay;
   if(!rangeEnd)rangeEnd=selectedDay;
   if(!weekStart)weekStart=selectedDay;
   renderCalendar(false);
  };
  modeLabel.append(mode);
  const picking=make('div',undefined,'sl-cal-select');picking.append(modeLabel);
  if(selectionMode==='range'){
   for(const [key,label] of [['start','من تاريخ'],['end','إلى تاريخ']]){
    const field=make('label',label),input=make('input');input.type='date';
    input.value=key==='start'?rangeStart:rangeEnd;
    input.onchange=()=>{if(key==='start')rangeStart=input.value;else rangeEnd=input.value};
    field.append(input);picking.append(field);
   }
  }
  if(selectionMode==='weeks'){
   const from=make('label','بداية الأسابيع'),dateInput=make('input');
   dateInput.type='date';dateInput.value=weekStart;
   dateInput.onchange=()=>{weekStart=dateInput.value};
   from.append(dateInput);picking.append(from);
   const count=make('label','عدد الأسابيع'),numberInput=make('input');
   numberInput.type='number';numberInput.min='1';numberInput.max='16';numberInput.value=weekCount;
   numberInput.onchange=()=>{weekCount=Math.min(16,Math.max(1,Number(numberInput.value)||1));};
   count.append(numberInput);picking.append(count);
  }
  if(selectionMode==='multiple'){
   const weekButton=make('button','تحديد الأسبوع'),monthButton=make('button','تحديد الشهر');
   const clearButton=make('button','إلغاء تحديد الأيام');
   for(const button of [weekButton,monthButton,clearButton])button.type='button';
   weekButton.onclick=()=>{
    const stamp=new Date(selectedDay+'T12:00:00Z');
    stamp.setUTCDate(stamp.getUTCDate()-stamp.getUTCDay());
    for(const day of addDays(iso(stamp.getUTCFullYear(),stamp.getUTCMonth()+1,stamp.getUTCDate()),7))
     selectionDates.add(day);
    renderCalendar(false);
   };
   monthButton.onclick=()=>{
    for(const day of addDays(iso(year,month,1),new Date(Date.UTC(year,month,0)).getUTCDate()))
     selectionDates.add(day);
    renderCalendar(false);
   };
   clearButton.onclick=()=>{selectionDates.clear();renderCalendar(false)};
   picking.append(weekButton,monthButton,clearButton);
  }
  detail.append(picking);
  let days=[];
  try{days=selectedDatesForAction()}catch(e){/* validated again at save */}
  detail.append(make('p','الأيام المختارة: '+days.length+
   (days.length?' · من '+days[0]+' إلى '+days.at(-1):' · اختر أيامًا من التقويم'),'sl-cal-selection-count'));
  const selectLabel=make('label','التصنيف المطلوب'),type=make('select');
  for(const [key,label] of Object.entries(kinds)){
   const option=make('option',label);option.value=key;type.append(option);
  }
  // Explicit saved override wins over the official default. "default"
  // removes that override, restoring the official or ordinary school day.
  type.value=selectedDay?classify(selectedDay):'holiday';
  selectLabel.append(type);detail.append(selectLabel);
  detail.append(make('p','الترتيب: تصنيف الطالب الخاص، ثم تعديل الحلقة، ثم تقويم المدينة المنورة المعتمد، ثم يوم دراسي. الإجازة الصيفية غير مستثناة.','sl-academic-muted'));
  const choices=make('div');drawChoices(choices);
  detail.append(make('p','اختر المجمع أو الحلقات التي سيطبق عليها التعديل:'),choices);
  const save=make('button','اعتماد الأيام المحددة'),refresh=make('button','متابعة تسوية المقررات');
  save.type=refresh.type='button';
  const report=make('div',lastBreakdown,'sl-calendar-breakdown');report.hidden=!lastBreakdown;
  detail.append(save,refresh,state,report);
  if(lastReport)state.textContent=lastReport;
  refresh.onclick=async()=>{
   if(running)return;
   const ids=[...checked];if(!ids.length){message('حدد حلقة واحدة على الأقل.');return}
   let dates;
   try{dates=selectedDatesForAction();if(!dates.length)throw Error('اختر يومًا أولًا.')}
   catch(e){message(e.message);return}
   refresh.disabled=true;
   try{
    // One report per selected date, using the same scoped administrative RPC.
    const all=[];
    for(const day of dates.slice(0,14)){
     const {data,error}=await client.rpc('get_calendar_reflow_status_guarded',
       {p_circle_ids:ids,p_date:day});
     if(error)throw Error(error.message);
     all.push(...(data||[]).map(row=>({date:day,...row})));
    }
    const pending=all.reduce((n,r)=>n+Number(r.pending||0),0),
      failed=all.reduce((n,r)=>n+Number(r.failed||0),0);
    message('حالة أول '+Math.min(14,dates.length)+' يومًا: '+pending+' طالبًا قيد المعالجة و'+failed+' يحتاجون مراجعة.');
    lastBreakdown=all.filter(r=>r.pending||r.failed).map(r=>{
      const c=findCircle(r.circleId);
      return r.date+' — '+(c?.name||'حلقة')+': المتبقي '+r.pending+'، المتعثر '+r.failed;
    }).join('\n')||'لا توجد تسويات متعثرة ضمن الأيام المفحوصة.';
    report.textContent=lastBreakdown;report.hidden=false;
   }catch(e){message('تعذر قراءة حالة التسوية: '+explainError(e))}
   finally{refresh.disabled=false}
  };
  save.onclick=async()=>{
   if(running)return;
   const ids=[...checked],newType=type.value;let dates;
   try{
    dates=selectedDatesForAction();
    if(!ids.length)throw Error('اختر مجمعًا أو حلقة على الأقل.');
    if(!dates.length)throw Error('اختر يومًا أو فترة أولًا.');
    if(dates.length>120)throw Error('الفترة طويلة جدًا؛ اختر ١٢٠ يومًا أو أقل.');
   }catch(e){message(e.message);return}
   if(!window.confirm('اعتماد «'+kinds[newType]+'» لعدد '+dates.length+
     ' يومًا على '+ids.length+' حلقة؟ تحافظ المنصة على الأعمال المسجلة، وتستكمل ترحيل المقررات غير المنجزة لاحقًا.'))return;
   running=true;save.disabled=true;refresh.disabled=true;previous.disabled=true;next.disabled=true;
   let ok=0,queued=0;
   try{
    // 7 days x 10 circles => at most 70 circle-days per server transaction.
    // The user confirms once, while the UI reports partially completed chunks.
    for(let d=0;d<dates.length;d+=7){
     const group=dates.slice(d,d+7);
     for(let c=0;c<ids.length;c+=10){
      const circlesBatch=ids.slice(c,c+10);
      const {data,error}=await client.rpc('apply_calendar_days_bulk_guarded',
       {p_circle_ids:circlesBatch,p_dates:group,p_day_type:newType});
      if(error)throw Error(error.message||'تعذر حفظ الدفعة.');
      if(data?.ok!==true||Number(data.days)!==group.length||
        Number(data.circles)!==circlesBatch.length)
       throw Error('لم يؤكد الخادم اعتماد الدفعة كاملة.');
      ok+=group.length*circlesBatch.length;
      queued+=Number(data.queuedStudents||0);
      message('اكتمل تصنيف '+ok+' من '+dates.length*ids.length+' يوم-حلقة.');
     }
    }
    monthlyCache.clear();
    lastBreakdown='تم اعتماد '+dates.length+' يومًا على '+ids.length+
      ' حلقة. وُضعت '+queued+' مهمة تسوية للمقررات غير المنجزة.';
    message(lastBreakdown+' لا يلزم إبقاء الصفحة مفتوحة.');
    await renderCalendar(true);
   }catch(e){
    console.warn('Calendar bulk classification',e);
    message('اكتمل '+ok+' يوم-حلقة، وتوقفت بقية العملية: '+explainError(e)+
      ' أعد المحاولة؛ الدفعات المكتملة محفوظة دون تكرار ترحيل إنجازاتها.');
   }finally{
    running=false;save.disabled=false;refresh.disabled=false;previous.disabled=false;next.disabled=false;
   }
  };
 }
 async function renderCalendar(load=true){
  // Draw the requested month immediately. Network response only repaints the
  // decorations of that same month and cannot jump backwards after rapid taps.
  const serial=load?++renderSequence:renderSequence,y=year,m=month,key=iso(y,m,1);
  if(load)overrides=monthlyCache.get(key)||new Map();
  monthLabel.textContent=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{
   month:'long',year:'numeric',timeZone:'UTC'
  }).format(new Date(Date.UTC(year,month-1,1)));
  grid.replaceChildren();
  const firstWeekday=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();
  for(let i=0;i<firstWeekday;i++)grid.append(make('div'));
  for(let day=1;day<=last;day++){
   const date=iso(year,month,day),official=calcOfficial(date),pending=calcReference(date);
   const button=make('button',undefined,'sl-academic-day'+
     (official?' is-official':pending?' is-pending':'')+
     ([...checked].some(id=>overrides.has(id+'|'+date))?' is-changed':''));
   button.type='button';button.setAttribute('aria-pressed',String(selectionMode==='multiple'?selectionDates.has(date):date===selectedDay));
   if(selectionMode==='multiple'&&selectionDates.has(date))button.classList.add('is-selected');
   button.append(make('strong',day),make('small',official?official:
     pending?'بانتظار الاعتماد · '+pending:
     [...checked].some(id=>overrides.has(id+'|'+date))?kinds[classify(date)]:'' ));
   button.onclick=()=>{
     if(running)return;
     selectedDay=date;
     if(selectionMode==='multiple'){
       if(selectionDates.has(date))selectionDates.delete(date);else selectionDates.add(date);
     }else if(selectionMode==='range'){
       if(!rangeStart||rangeStart&&rangeEnd){rangeStart=date;rangeEnd='';}
       else{rangeEnd=date;if(rangeEnd<rangeStart){const swap=rangeStart;rangeStart=rangeEnd;rangeEnd=swap}}
     }else if(selectionMode==='weeks'){weekStart=date;}
     renderCalendar(false);
   };
   grid.append(button);
  }
  renderDetail();
  if(load&&!monthlyCache.has(key)){
   try{
    const monthOverrides=await fetchOverrides(y,m);
    if(serial===renderSequence&&year===y&&month===m){
     overrides=monthOverrides;
     await renderCalendar(false);
    }
   }catch(err){
    if(serial===renderSequence)message('تعذر جلب تصنيفات الشهر: '+explainError(err));
   }
  }
 }
 const moveMonth=(step,event)=>{
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if(running)return;
  const date=new Date(Date.UTC(year,month-1+step,1));
  year=date.getUTCFullYear();month=date.getUTCMonth()+1;selectedDay='';
  // Deliberately do not await the API: the month buttons stay responsive.
  void renderCalendar(true);
 };
 previous.onclick=event=>moveMonth(-1,event);
 next.onclick=event=>moveMonth(1,event);
 document.body.append(dialog);
 dialog.addEventListener('close',()=>{cancelled=true;dialog.remove()},{once:true});
 dialog.showModal();await renderCalendar();
}
window.SanabilPlanCalendar={open,officialEvents:verified,referenceEvents:laterReferences,officialFor:calcOfficial,referenceFor:calcReference};
})();