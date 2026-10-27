/* Sanabil teacher quick path: one authenticated account, two reversible working layouts.
   It never forges attendance and never changes the existing guarded outcome saves. */
(()=>{'use strict';if(window.SanabilTeacherFastPath)return;
const L='sanabil_teacher_mode_v1:', S='sanabil_fast_launch_v1:', STATUS='sanabil_fast_fingerprint_v2:';
const node=(tag,cls,label)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(label!==undefined)e.textContent=label;return e};
const button=(label,fn,cls='')=>{const b=node('button','button '+cls,label);b.type='button';b.addEventListener('click',fn);return b};
const store=(key,value,area=localStorage)=>{try{area.setItem(key,JSON.stringify(value))}catch{}};
const read=(key,area=localStorage)=>{try{return JSON.parse(area.getItem(key)||'null')}catch{return null}};
const preferred=user=>read(L+user);
const choose=(user,mode)=>{if(!['fast','general'].includes(mode))return;store(L+user,mode)};
const DEFAULT_CIRCLE='sanabil_fast_default_circle_v1:';
// A favorite is an account-specific UI preference, never a change to circle assignments.
const favorite=(user,circles=[])=>{
 const id=read(DEFAULT_CIRCLE+user);
 return circles.find(c=>c.id===id)?.id||null;
};
const setFavorite=(user,id,circles=[])=>{
 const allowed=circles.find(c=>c.id===id);
 if(!allowed||!user)return false;
 store(DEFAULT_CIRCLE+user,allowed.id);
 return true;
};
const sessionToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fingerKey=(user,circle,date)=>STATUS+user+':'+circle+':'+date;
const pending=new Map();
const emit=(key,value)=>{store(key,value,sessionStorage);window.dispatchEvent(new CustomEvent('sanabil-fast-fingerprint',{detail:{key,value}}))};
const describe=val=>{
 switch(val?.state){
 case 'confirmed':{
   let registered='';
   if(val?.confirmedCheckInAt){
     try{registered=' الساعة '+new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',hour:'numeric',minute:'2-digit'}).format(new Date(val.confirmedCheckInAt))}catch{}
   }
   return 'تم تسجيل حضور المعلم لدى الخادم'+registered+(val.lateMinutes>0?' · تأخر '+val.lateMinutes+' دقيقة':' · دون تأخر')+'.';
 }
 case 'pending':return'أُرسل طلب البصمة للمراجعة بعد انقطاع الاتصال؛ لم يُعتمد الحضور بعد.';
 case 'running':return'جارٍ التحقق من البصمة دون تعطيل بدء الحلقة…';
 case 'failed':return'تعذرت البصمة: '+(val.message||'غير معروف')+' · يمكنك متابعة التسميع وإعادة المحاولة.';
 default:return'لم تبدأ محاولة بصمة لهذه الجلسة بعد.';
 }
};
const gps=()=>new Promise((resolve,reject)=>{
 if(!navigator.geolocation)return reject(Error('خدمة الموقع الجغرافي غير متاحة على الجهاز'));
 navigator.geolocation.getCurrentPosition(resolve,err=>reject(Error(err.code===1?'إذن الموقع مرفوض':err.code===3?'انتهت مهلة تحديد الموقع':'لم يتمكن الجهاز من تحديد موقعك')),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
});
async function fingerprintError(error){
 // Supabase FunctionsHttpError keeps the actionable server message in Response.context.
 let message=String(error?.message||'تعذرت استجابة خدمة الحضور');
 try{
  const response=error?.context;
  const payload=response?.clone?await response.clone().json():await response?.json?.();
  if(typeof payload?.error==='string'&&payload.error.trim())return payload.error.trim();
  if(typeof payload?.message==='string'&&payload.message.trim())return payload.message.trim();
 }catch{}
 return message==='Edge Function returned a non-2xx status code'
  ?'رفض خادم الحضور تسجيل البصمة. تحقق من وقت الدوام والنطاق الجغرافي أو أعد المحاولة لاحقًا.'
  :message;
}
async function fingerprint({user,circle,date,server,force=false}){
 if(!user||!circle?.id||!date||!server)return;
 const key=fingerKey(user,circle.id,date);
 const prior=read(key,sessionStorage);
 if(prior?.state==='confirmed'&&!force)return prior;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  const update=(state,message,extra={})=>{const value={state,message,at:Date.now(),...extra};emit(key,value);return value};
  update('running','التحقق من الموقع والوقت');
  if(date!==sessionToday())return update('failed','لا تتاح بصمة الحضور إلا لليوم الحالي');
  if(!circle.mosque_id)return update('failed','الحلقة غير مرتبطة بمسجد ذي نطاق بصمة');
  let point;
  try{point=await gps()}catch(error){return update('failed',error.message)}
  const args={p_circle_id:circle.id,p_mosque_id:circle.mosque_id,p_kind:'checkIn',
   p_captured_at:new Date(point.timestamp||Date.now()).toISOString(),
   p_lat:point.coords.latitude,p_lng:point.coords.longitude,p_accuracy:point.coords.accuracy};
  if(!navigator.onLine){
    try{
     if(!window.SanabilOffline?.queue)throw Error('المزامنة المؤجلة غير متاحة');
     await window.SanabilOffline.queue('submit_offline_attendance_claim',args,'طلب بصمة حضور المسار السريع');
     return update('pending','طلب معلق للمراجعة، وليس بصمة معتمدة');
    }catch(error){return update('failed',error.message)}
  }
  try{
   const {data,error}=await server.functions.invoke('sanabil-attendance',{body:{
    action:'checkIn',mosqueId:circle.mosque_id,circleId:circle.id,
    latitude:point.coords.latitude,longitude:point.coords.longitude,accuracy:point.coords.accuracy
   }});
   if(error||data?.error){
    // A business-rule denial (time/geofence) must never create a queued attendance.
    if(!navigator.onLine&&window.SanabilOffline?.queue){
     await window.SanabilOffline.queue('submit_offline_attendance_claim',args,'طلب بصمة حضور المسار السريع');
     return update('pending','طلب قيد مراجعة المشرف');
    }
    return update('failed',data?.error||(error?await fingerprintError(error):'رفض خادم البصمة الطلب'));
   }
   return update('confirmed','سجل حضور مؤكد', {lateMinutes:Number(data?.lateMinutes||0),duplicate:!!data?.duplicate,confirmedCheckInAt:data?.confirmedCheckInAt||null});
  }catch(error){return update('failed',error?.message||'تعذر التواصل مع خدمة البصمة')}
 })().finally(()=>pending.delete(key));
 pending.set(key,task);return task;
}
async function mountDashboard({root,access,user,loadCircles,navigate,server}){
 if(!root||!user||!access?.roles?.includes('teacher')||access.roles.some(r=>['admin','manager','supervisor'].includes(r))||root._sanabilFastDashboard)return;
 root._sanabilFastDashboard=true;
 const general=node('div','sl-fast-general'),quick=node('section','sl-fast-entry');
 while(root.firstChild)general.append(root.firstChild);
 const heading=node('h2','','المسار السريع للمعلم');
 const desc=node('p','sl-fast-help','بدء حلقة اليوم والتسميع والتحضير والترشيحات دون شاشات إدارية.');
 const top=node('div','sl-fast-start-actions');
 const modeBar=node('div','sl-fast-switcher');
 const fastBtn=button('⚡ المسار السريع',()=>setMode('fast'),'button-primary');
 const generalBtn=button('☷ المسار العام',()=>setMode('general'),'button-soft');
 modeBar.append(fastBtn,generalBtn);
 const label=node('div','sl-fast-label');
 const labelText=node('span','','حلقة اليوم');
 // Native select is retained as the session's value; the visible picker can
 // show one real star button next to each circle (not possible in <option>).
 const picker=node('details','sl-fast-circle-picker');
 const summary=node('summary','sl-fast-circle-summary','اختر الحلقة');
 const options=node('div','sl-fast-circle-options');
 const select=node('select','sl-fast-circle-value');select.hidden=true;
 select.setAttribute('aria-label','الحلقة المختارة للجلسة');
 picker.append(summary,options,select);label.append(labelText,picker);
 const status=node('p','sl-fast-status','اختر الحلقة ثم اضغط بدء الجلسة.');
 status.setAttribute('role','status');
 const start=button('▶ بدء جلسة الحلقة',startCircle,'button-primary sl-fast-start');
 start.disabled=true;
 top.append(label,start,status);
 quick.append(heading,desc,top);
 root.append(modeBar,quick,general);
 let circles=[];
 const renderCircleOptions=()=>{
  const defaultId=favorite(user,circles),selectedId=select.value;
  const current=circles.find(c=>c.id===selectedId);
  summary.textContent=(selectedId===defaultId?'★ ':'')+(current?.name||'اختر الحلقة');
  summary.setAttribute('aria-label','حلقة اليوم: '+(current?.name||'اختر الحلقة')+
   (selectedId===defaultId?'، الحلقة الافتراضية':'')+'؛ اضغط لتغيير الحلقة أو تعيين نجمة');
  options.replaceChildren(...circles.map(circle=>{
   const row=node('div','sl-fast-circle-row');
   const active=circle.id===defaultId,selected=circle.id===selectedId;
   const star=button(active?'★':'☆',()=>{
    if(!setFavorite(user,circle.id,circles))return;
    select.value=circle.id;
    status.textContent='تم تعيين «'+(circle.name||'الحلقة')+'» حلقة افتراضية. ستظهر تلقائيًا عند العودة للمسار السريع.';
    renderCircleOptions();
   },'sl-fast-circle-star'+(active?' is-favorite':''));
   star.setAttribute('aria-pressed',String(active));
   star.setAttribute('aria-label',active?'الحلقة الافتراضية: '+(circle.name||'حلقة'):
    'تعيين '+(circle.name||'الحلقة')+' حلقة افتراضية');
   star.title=active?'الحلقة الافتراضية الحالية':'اضغط النجمة لجعل هذه الحلقة افتراضية';
   const chooseCircle=button(circle.name||'حلقة',()=>{
    select.value=circle.id;
    picker.open=false;
    status.textContent='اخترت «'+(circle.name||'الحلقة')+'» لهذه الجلسة فقط. النجمة الافتراضية لم تتغير.';
    renderCircleOptions();
   },'sl-fast-circle-option'+(selected?' is-selected':''));
   chooseCircle.setAttribute('aria-current',String(selected));
   row.append(star,chooseCircle);
   return row;
  }));
 };
 const setMode=mode=>{
  choose(user,mode);quick.hidden=mode!=='fast';general.hidden=mode!=='general';
  fastBtn.setAttribute('aria-pressed',String(mode==='fast'));
  generalBtn.setAttribute('aria-pressed',String(mode==='general'));
 };
 setMode(preferred(user)==='general'?'general':'fast');
 try{
  const data=await loadCircles();
  if(!root.isConnected)return;
  circles=(data?.circles||[]).filter(c=>c.active!==false);
  select.replaceChildren(...circles.map(c=>{const o=node('option','',c.name||'حلقة');o.value=c.id;return o}));
  const saved=read('sanabil_last_fast_circle_v1:'+user);
  const defaultId=favorite(user,circles);
  // The explicit favorite wins over the last temporary session selection.
  const initial=defaultId||(circles.some(c=>c.id===saved)?saved:circles[0]?.id);
  if(initial)select.value=initial;
  renderCircleOptions();
  start.disabled=!circles.length;
  if(!circles.length)status.textContent='لا توجد حلقة نشطة مسندة إلى حسابك. انتقل للمسار العام أو تواصل مع مشرف المجمع.';
 }catch(error){status.textContent='تعذر تحميل الحلقات: '+error.message}
 function startCircle(){
  const c=circles.find(c=>c.id===select.value);
  if(!c){status.textContent='اختر حلقة مسندة إلى حسابك.';return}
  const date=sessionToday();store('sanabil_last_fast_circle_v1:'+user,c.id);
  store('sanabil_outcome_selected_circle_v1:'+user,c.id);
  store(S+user,{circle:c.id,date,at:Date.now()},sessionStorage);
  status.textContent='يُفتح التسميع الآن، ويجري التحقق من البصمة بصورة مستقلة…';
  // Called immediately from the user gesture, before navigation; browser may ask for GPS consent.
  void fingerprint({user,circle:c,date,server});
  navigate('outcomes');
 }
}
function consumeLaunch(user,allowed){
 const key=S+user,launch=read(key,sessionStorage);
 try{sessionStorage.removeItem(key)}catch{}
 if(!launch||Date.now()-Number(launch.at||0)>120000||launch.date!==sessionToday())return null;
 return allowed?.find(c=>c.id===launch.circle)?launch:null;
}
function mountOutcomes({root,access,user,circles,navigate,server}){
 if(!root||!user||!access?.roles?.includes('teacher')||access.roles.some(r=>['admin','manager','supervisor'].includes(r)))return null;
 if(root._sanabilFastOutcomes)return root._sanabilFastOutcomes;
 const bar=node('section','sl-fast-session-bar');
 const switcher=button('☷ الانتقال للمسار العام',()=>setMode(root.classList.contains('sl-fast-session')?'general':'fast'),'button-soft');
 const state=node('p','sl-fast-fingerprint-info',''),retry=button('إعادة محاولة البصمة',retryFinger,'button-soft');
 state.setAttribute('role','status');
 const identity=node('strong','','جلسة التسميع اليومية');
 const progress=node('p','sl-fast-outcome-progress','تحميل الطلاب والحصيلة مستقل تمامًا عن نتيجة البصمة.');
 progress.setAttribute('role','status');
 const openOutcomes=button('فتح حصيلة الحلقة',()=>{
  const circle=current(),load=root.querySelector('[data-action="load"]');
  if(!circle){progress.textContent='حدد الحلقة أولًا لفتح الحصيلة.';return}
  if(!load){progress.textContent='تعذّر العثور على أمر فتح الحصيلة. حدّث الصفحة وأعد المحاولة.';return}
  if(load.disabled){progress.textContent='جارٍ تحميل حصيلة الحلقة، انتظر اكتمال الطلب.';return}
  progress.textContent='جارٍ فتح قائمة الطلاب والحصائل دون انتظار تسجيل البصمة…';
  root.classList.remove('sl-fast-session-ready');
  load.click();
 },'button-primary sl-fast-open-outcomes');
 const sessionActions=node('div','sl-fast-session-actions');
 sessionActions.append(openOutcomes);
 const meta=node('div','sl-fast-session-meta');
 meta.append(identity,switcher);
 bar.append(meta,state,retry,sessionActions,progress);
 root.prepend(bar);
 const select=root.querySelector('[name="circle"]');
 const current=()=>circles.find(c=>c.id===select?.value);
 const update=()=>{
  const c=current(),key=c?fingerKey(user,c.id,sessionToday()):'';
  const value=key?read(key,sessionStorage):null;
  state.textContent=describe(value);
  retry.hidden=!!value&&['confirmed','running'].includes(value.state);
 };
 const notify=event=>{const c=current();if(c&&event.detail?.key===fingerKey(user,c.id,sessionToday()))update()};
 window.addEventListener('sanabil-fast-fingerprint',notify);
 select?.addEventListener('change',update);
 const sessionContent=root.querySelector('.sl-data');
 let loading=false;
 let quickInitializedFor=null;
 const sessionReady=()=>!!sessionContent?.querySelector('.sl-student-grid,.sl-quick-outcomes');
 const refreshSessionView=()=>{
  const ready=sessionReady();
  root.classList.toggle('sl-fast-session-ready',ready);
  if(ready){
   progress.textContent='قائمة الطلاب جاهزة؛ سجّل التحضير والحصيلة واحفظها بالطريقة المعتادة.';
   openOutcomes.textContent='تحديث حصيلة الحلقة';
   // Initialize quick mode just once for a newly rendered list. A user
   // switching to detailed mode must never be forced back by DOM mutations.
   const quickList=sessionContent?.querySelector('.sl-quick-outcomes');
   if(quickList&&quickList!==quickInitializedFor){
    quickInitializedFor=quickList;
    const toggle=sessionContent?.querySelector('.sl-quick-mode-toggle');
    if(root.classList.contains('sl-fast-session')&&toggle
       &&!sessionContent.classList.contains('sl-quick-mode'))toggle.click();
   }
  }else{
   openOutcomes.textContent='فتح حصيلة الحلقة';
  }
 };
 if(sessionContent&&typeof MutationObserver!=='undefined'){
  const watcher=new MutationObserver(refreshSessionView);
  watcher.observe(sessionContent,{subtree:true,childList:true});
 }
 const loadButton=root.querySelector('[data-action="load"]');
 if(loadButton&&typeof MutationObserver!=='undefined'){
  const watcher=new MutationObserver(()=>{
   const busy=loadButton.getAttribute('aria-busy')==='true';
   if(busy){loading=true;progress.textContent='جارٍ تحميل الطلاب والحصائل…';return}
   if(!loading)return;
   loading=false;
   refreshSessionView();
   if(!sessionReady()){
    const reason=root.querySelector('.sl-message')?.textContent?.trim();
    progress.textContent=reason
     ?'تعذر فتح الحصيلة: '+reason+' · يمكنك إعادة المحاولة دون إعادة البصمة.'
     :'لم تظهر قائمة الطلاب بعد. أعد محاولة فتح الحصيلة؛ لا يلزم إعادة البصمة.';
   }
  });
  watcher.observe(loadButton,{attributes:true,attributeFilter:['aria-busy']});
 }
 const setMode=mode=>{
  choose(user,mode);
  const fast=mode==='fast';
  root.classList.toggle('sl-fast-session',fast);
  switcher.textContent=fast?'☷ الانتقال للمسار العام':'⚡ العودة للمسار السريع';
  switcher.setAttribute('aria-pressed',String(!fast));
  if(fast){
   const quick=root.querySelector('.sl-data .sl-quick-outcomes');
   const box=root.querySelector('.sl-data');
   if(box&&quick&&!box.classList.contains('sl-quick-mode'))quick.querySelector('.sl-quick-mode-toggle')?.click();
  }
  update();
 };
 async function retryFinger(){
  const circle=current();if(!circle)return;
  retry.disabled=true;
  try{await fingerprint({user,circle,date:sessionToday(),server,force:true})}
  finally{retry.disabled=false;update()}
 }
 setMode(preferred(user)==='fast'?'fast':'general');
 refreshSessionView();
 const result={update,setMode,refreshSessionView};
 root._sanabilFastOutcomes=result;
 return result;
}
function setQuickUp(root){
 if(!root?.classList.contains('sl-fast-session'))return;
 root.querySelector('.sl-fast-session-bar')?.scrollIntoView?.({block:'nearest'});
}
async function bulkNominate({students,studentIds,circle,server}){
 if(!studentIds?.length||studentIds.length>60)throw Error('حدد من طالب واحد إلى 60 طالبًا للترشيح.');
 if(!circle)throw Error('الحلقة غير محددة.');
 const ids=[...new Set(studentIds)];
 if(ids.length!==studentIds.length)throw Error('تكرر تحديد أحد الطلاب.');
 const picked=(students||[]).filter(s=>ids.includes(s.studentId));
 if(picked.length!==ids.length)throw Error('تحقق من الطلاب المحددين.');
 const d=document.createElement('dialog');d.className='sl-fast-nomination-dialog';d.dir='rtl';
 const title=node('h3','', 'ترشيح '+ids.length+' طلاب للاختبار');
 const note=node('p','sl-fast-help','يرسل الطلب إلى مشرف المجمع داخل سنابل الوحي. الربط المباشر مع جدير غير مفعل.');
 const form=document.createElement('form');
 const line=(label,control)=>{const l=node('label','sl-fast-label',label);l.append(control);return l};
 const type=document.createElement('select');type.name='type';
 for(const [id,name] of [['activation','اختبار تنشيطي'],['placement','اختبار تحديد مستوى'],['juz','اختبار أجزاء'],['phased','اختبار مرحلي']]){
  const o=node('option','',name);o.value=id;type.append(o);
 }
 const syllabus=document.createElement('input');syllabus.name='syllabus';syllabus.required=true;
 const count=document.createElement('input');count.name='count';count.type='number';count.min='2';count.max='15';count.value='3';count.required=true;
 const lines=document.createElement('input');lines.name='lines';lines.type='number';lines.min='5';lines.max='10';lines.value='10';lines.required=true;
 form.append(line('نوع الاختبار',type),line('مقرر الاختبار',syllabus),line('عدد الأسئلة',count),line('عدد الأسطر لكل سؤال',lines));
 const names=node('p','sl-fast-selected-names','الطلاب: '+picked.map(s=>s.fullName).join('، '));
 const result=node('p','sl-fast-nomination-status','');result.setAttribute('role','status');
 const save=node('button','button button-primary','إرسال الترشيحات المحددة');
 save.type='submit';save.disabled=true;
 const cancel=button('إغلاق',()=>d.close(),'button-soft');cancel.type='button';
 form.append(save,cancel);
 d.append(title,note,names,form,result);
 document.body.append(d);
 d.addEventListener('close',()=>d.remove(),{once:true});
 d.showModal();
 try{
  if(typeof window.SanabilExamEnhanceForm!=='function')throw Error('تعذر تحميل اختيار مقرر الاختبار؛ أعد تحديث الصفحة.');
  await window.SanabilExamEnhanceForm(form);
  save.disabled=false;
 }catch(error){save.disabled=true;result.textContent=error.message;return}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(save.disabled)return;
  if(!form.reportValidity())return;
  save.disabled=true;cancel.disabled=true;result.textContent='جارٍ التحقق من الأهلية والترشيحات السابقة…';
  try{
   const syllabusData=form.__v13GetSyllabus?.();
   if(!syllabusData?.label)throw Error('حدد مقرر الاختبار بدقة.');
   const questions=Number(count.value),perQuestion=Number(lines.value);
   if(!Number.isInteger(questions)||questions<2||questions>15||!Number.isInteger(perQuestion)||perQuestion<5||perQuestion>10)throw Error('عدد الأسئلة أو الأسطر غير صحيح.');
   const roster=await server.from('students').select('id,full_name,teacher_id,org_id,complex_id,circle_id')
    .in('id',ids).eq('circle_id',circle).eq('active',true);
   if(roster.error)throw roster.error;
   const eligible=roster.data||[];
   if(eligible.length!==ids.length||eligible.some(s=>!s.teacher_id))throw Error('بعض الطلاب غير مسندين أو لا يحق ترشيحهم؛ لم تُرسل أي طلبات.');
   const existing=await server.from('exam_requests').select('student_id,type,status,syllabus').in('student_id',ids)
    .in('status',['pending','approved','scheduled']);
   if(existing.error)throw existing.error;
   const conflict=(existing.data||[]).filter(x=>x.type===syllabusData.mode&&x.syllabus?.label===syllabusData.label);
   if(conflict.length)throw Error('يوجد ترشيح قائم مطابق لعدد '+conflict.length+' من الطلاب. راجع الطلبات قبل محاولة جديدة؛ لم يُرسل أي طلب.');
   if(!window.confirm('إرسال '+ids.length+' ترشيحات بنوع '+syllabusData.mode+' ومقرر '+syllabusData.label+' إلى مشرف المجمع؟'))return;
   const records=eligible.map(s=>({id:crypto.randomUUID(),org_id:s.org_id,complex_id:s.complex_id,circle_id:s.circle_id,
    teacher_id:s.teacher_id,student_id:s.id,type:syllabusData.mode,syllabus:syllabusData,
    question_count:questions,lines_per_question:perQuestion,status:'pending'}));
   const saved=await server.from('exam_requests').insert(records).select('student_id');
   if(saved.error)throw saved.error;
   if(saved.data?.length!==ids.length)throw Error('تعذر تأكيد جميع الترشيحات؛ راجع الطلبات ولا تعِد الإرسال قبل التحقق.');
   result.textContent='تم إرسال '+saved.data.length+' ترشيحات إلى مشرف المجمع بنجاح.';
   save.hidden=true;
  }catch(error){result.textContent='لم تكتمل العملية: '+(error.message||error)}
  finally{save.disabled=false;cancel.disabled=false}
 });
}
window.SanabilTeacherFastPath={mountDashboard,mountOutcomes,consumeLaunch,fingerprint,bulkNominate,preferred,choose,favorite,setFavorite,describe,setQuickUp};
})();