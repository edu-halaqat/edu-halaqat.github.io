/* Sanabil manager-only academic day calendar. Official regional windows 1448-1449
   sourced from the Ministry's general education calendar as displayed by RCJY,
   checked 2026-10-24. Later years remain "not yet verified" rather than invented.
   Explicit approval uses existing audited set_day_type_guarded transaction. */
(()=>{'use strict';if(window.SanabilPlanCalendar)return;
const source='https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx';
const verified=[
 ['2026-09-23','2026-09-26','إجازة اليوم الوطني'],
 ['2026-10-25','2026-10-25','إجازة إضافية للمدينة المنورة'],
 ['2026-11-20','2026-11-28','إجازة الخريف'],
 ['2027-01-08','2027-01-16','إجازة منتصف العام'],
 ['2027-02-19','2027-02-22','إجازة يوم التأسيس'],
 ['2027-02-26','2027-03-13','إجازة عيد الفطر'],
 ['2027-04-30','2027-05-22','إجازة عيد الأضحى للمدينة المنورة']
];
const kinds={study:'يوم دراسي',test:'يوم اختبار',holiday:'إجازة',unaccounted:'غير محتسب'};
const pad=x=>String(x).padStart(2,'0');
const iso=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
const weekdayNames=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const calcOfficial=d=>verified.find(([start,end])=>d>=start&&d<=end)?.[2]||'';
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
 '.sl-academic-week,.sl-academic-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}',
 '.sl-academic-week>div{text-align:center;font-weight:700;font-size:.78rem;padding:7px 0}',
 '.sl-academic-day{border:1px solid #99b6a6;border-radius:9px;min-height:66px;padding:5px;display:flex;flex-direction:column;align-items:center;gap:4px;color:inherit;background:transparent;font:inherit;cursor:pointer}',
 '.sl-academic-day strong{font-size:1rem}.sl-academic-day small{font-size:.67rem;text-align:center;overflow-wrap:anywhere;line-height:1.2}',
 '.sl-academic-day.is-official{background:#d2eddd;color:#14573c}.sl-academic-day.is-changed{outline:2px solid #238c78}',
 '.sl-academic-day[aria-pressed=true]{outline:3px solid #a57b2e}',
 '.sl-academic-day:disabled{opacity:.25;cursor:auto}.sl-academic-detail{margin-top:14px;border:1px solid #93b4a5;border-radius:12px;padding:14px}',
 '.sl-academic-circles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:7px;margin:12px 0}',
 '.sl-academic-circles label{display:flex;gap:6px;align-items:center;font-size:.85rem}',
 '.sl-academic-state{min-height:25px;white-space:pre-wrap;line-height:1.7}',
 '@media(max-width:650px){.sl-academic-cal{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;padding:11px}.sl-academic-day{min-height:56px;padding:3px}.sl-academic-day small{font-size:.59rem}.sl-academic-week>div{font-size:.68rem}}'
 ].join('\n');document.head.append(e);
};
async function open({circles,selectedCircle}={}){
 const client=window.supabaseClient;
 if(!client)throw Error('تعذر الاتصال بالخادم.');
 if(!Array.isArray(circles)||!circles.length)throw Error('لا توجد حلقات مخولة في هذا المجمع.');
 // The existing guarded day-type RPC is the ultimate authorization. This
 // gate only hides the calendar from unauthorized teachers.
 const {data:access,error:accessError}=await client.rpc('my_access');
 if(accessError)throw Error('تعذر التحقق من الصلاحيات: '+accessError.message);
 const roleList=[...(access?.roles||[]),...(access?.data?.roles||[])].map(String);
 if(!roleList.some(r=>['admin','manager','supervisor'].includes(r)))
  throw Error('هذه الصفحة مخصصة لمدير النظام ومشرف المجمع.');
 style();const dialog=make('dialog');dialog.className='sl-academic-cal';
 const header=make('header',undefined,'sl-academic-head');
 const introduction=make('div');
 introduction.append(make('h2','أيام الإجازة والتقويم التعليمي'),
  make('p','التقويم المرجعي للمدينة المنورة؛ صيف الحلقات أيام تعليم مستمرة، ولا تُستبعد إجازة المدارس الصيفية.','sl-academic-muted'));
 const close=make('button','إغلاق');close.type='button';close.onclick=()=>dialog.close();
 header.append(introduction,close);dialog.append(header);
 const note=make('p','الإجازات الرسمية المثبتة للعام ١٤٤٨–١٤٤٩ تظهر باللون الأخضر، ولا تُنفّذ على خطط الطلاب حتى يعتمدها المشرف. الأعوام ١٤٤٩–١٤٥١ بحاجة إلى توثيق تواريخها الخاصة بالمدينة؛ لن نفترضها تلقائيًا.','sl-academic-muted');
 dialog.append(note);
 const src=make('a','مصدر التقويم الدراسي لوزارة التعليم');src.href=source;src.target='_blank';src.rel='noopener';dialog.append(src);
 const toolbar=make('div',undefined,'sl-academic-toolbar');
 const previous=make('button','الشهر السابق'),next=make('button','الشهر التالي'),monthLabel=make('strong');
 toolbar.append(previous,monthLabel,next);
 dialog.append(toolbar);
 const week=make('div',undefined,'sl-academic-week');
 weekdayNames.forEach(x=>week.append(make('div',x)));dialog.append(week);
 const grid=make('div',undefined,'sl-academic-days');dialog.append(grid);
 const detail=make('section',undefined,'sl-academic-detail');dialog.append(detail);
 const state=make('p','', 'sl-academic-state');detail.append(state);
 const now=new Date();let year=now.getFullYear(),month=now.getMonth()+1,selectedDay='',overrides=new Map();
 const checked=new Set([selectedCircle||circles[0].id]);
 function status(value){state.textContent=value}
 async function fetchOverrides(){
  overrides=new Map();
  const first=iso(year,month,1),last=iso(year,month,new Date(Date.UTC(year,month,0)).getUTCDate());
  // Single indexable range query for all selected circles, not one RPC per day.
  const ids=circles.map(c=>c.id);
  const {data,error}=await client.from('circle_day_types')
   .select('circle_id,date_key,day_type').in('circle_id',ids)
   .gte('date_key',first).lte('date_key',last).limit(1400);
  if(error){status('تعذر قراءة الاستثناءات المحفوظة؛ يمكن إعادة المحاولة.');return}
  for(const row of data||[])overrides.set(row.circle_id+'|'+row.date_key,row.day_type);
 }
 function chosenValue(date){
  const vals=[...checked].map(id=>overrides.get(id+'|'+date)).filter(Boolean);
  return vals.length===1?vals[0]:vals.length>1&&new Set(vals).size===1?vals[0]:dayTypeFrom(calcOfficial(date));
 }
 function renderDetail(){
  detail.replaceChildren();
  const title=make('h3',selectedDay?'تصنيف '+selectedDay:'اضغط يومًا من التقويم');detail.append(title);
  if(!selectedDay)return;
  const official=calcOfficial(selectedDay);
  detail.append(make('p',official?'الإجازة المرجعية: '+official:'لا توجد إجازة مرجعية مثبتة لهذا التاريخ.','sl-academic-muted'));
  const selectLabel=make('label','تصنيف اليوم');const type=make('select');
  Object.entries(kinds).forEach(([id,label])=>{const op=make('option',label);op.value=id;type.append(op)});
  type.value=chosenValue(selectedDay);selectLabel.append(type);detail.append(selectLabel);
  const circleBox=make('div',undefined,'sl-academic-circles');
  circles.forEach(c=>{
   const label=make('label');const checkbox=make('input');checkbox.type='checkbox';checkbox.checked=checked.has(c.id);
   checkbox.addEventListener('change',()=>checkbox.checked?checked.add(c.id):checked.delete(c.id));
   label.append(checkbox,make('span',c.name));circleBox.append(label);
  });
  detail.append(make('p','الحلقات التي سيطبّق عليها التصنيف:'),circleBox);
  const save=make('button','اعتماد اليوم للحلقات المحددة');
  save.type='button';
  save.onclick=async()=>{
   if(!checked.size){status('اختر حلقة واحدة على الأقل.');return}
   const ids=[...checked],newType=type.value;
   const label=kinds[newType]||newType;
   if(!window.confirm('اعتماد «'+label+'» بتاريخ '+selectedDay+' على '+ids.length+' حلقة؟ سيؤثر في جميع مقررات الطلاب غير المنجزة. لا تغيّر الأيام ذات النتائج المحفوظة.'))return;
   save.disabled=true;let done=0,fail=[];
   for(const id of ids){
    try{
     const {error}=await client.rpc('set_day_type_guarded',
       {p_circle_id:id,p_date:selectedDay,p_day_type:newType,p_student_id:null});
     if(error)throw Error(error.message);
     overrides.set(id+'|'+selectedDay,newType);done++;
    }catch(e){fail.push(circles.find(c=>c.id===id)?.name||'حلقة') ;status('عُدّل '+done+'؛ تعذر إكمال '+fail.length+' حلقة. '+e.message);break}
   }
   await renderCalendar(false);
   status('نجح تحديث '+done+' حلقة.'+(fail.length?' بعض الحلقات لم تُحدّث، راجع الرسالة السابقة.':' سيعاد تحميل مقرراتها من الخادم عند فتح الحصيلة.'));
   save.disabled=false;
  };
  detail.append(save);
  detail.append(make('p','التغيير يُحفظ عبر خدمة الصلاحيات والتحقق والترحيل في الخادم، ويُرفض اليوم إذا كان له إنجاز سابق غير قابل لإعادة الجدولة.','sl-academic-muted'));
  detail.append(state);
 }
 async function renderCalendar(load=true){
  if(load)await fetchOverrides();
  monthLabel.textContent=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
  grid.replaceChildren();
  const firstWeekday=new Date(Date.UTC(year,month-1,1)).getUTCDay(),last=new Date(Date.UTC(year,month,0)).getUTCDate();
  for(let i=0;i<firstWeekday;i++){const empty=make('div');grid.append(empty)}
  for(let day=1;day<=last;day++){
   const dt=iso(year,month,day),official=calcOfficial(dt),button=make('button');
   button.type='button';button.className='sl-academic-day'+(official?' is-official':'')+
     ([...checked].some(id=>overrides.has(id+'|'+dt))?' is-changed':'');
   button.setAttribute('aria-pressed',String(dt===selectedDay));
   button.append(make('strong',day),make('small',official?official:
     [...checked].some(id=>overrides.has(id+'|'+dt))?kinds[chosenValue(dt)]:'' ));
   button.onclick=()=>{selectedDay=dt;renderCalendar(false);renderDetail()};
   grid.append(button);
  }
  renderDetail();
 }
 previous.onclick=async()=>{if(--month===0){month=12;year--}selectedDay='';await renderCalendar()};
 next.onclick=async()=>{if(++month===13){month=1;year++}selectedDay='';await renderCalendar()};
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.showModal();await renderCalendar();
}
window.SanabilPlanCalendar={open,officialEvents:verified,officialFor:calcOfficial};
})();