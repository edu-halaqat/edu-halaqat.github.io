/* Sanabil teacher quick path: one authenticated account, two reversible working layouts.
   It never forges attendance and never changes the existing guarded outcome saves. */
(()=>{'use strict';if(window.SanabilTeacherFastPath)return;
const L='sanabil_teacher_mode_v1:', S='sanabil_fast_launch_v1:', STATUS='sanabil_fast_fingerprint_v1:';
const node=(tag,cls,label)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(label!==undefined)e.textContent=label;return e};
const button=(label,fn,cls='')=>{const b=node('button','button '+cls,label);b.type='button';b.addEventListener('click',fn);return b};
const store=(key,value,area=localStorage)=>{try{area.setItem(key,JSON.stringify(value))}catch{}};
const read=(key,area=localStorage)=>{try{return JSON.parse(area.getItem(key)||'null')}catch{return null}};
const preferred=user=>read(L+user);
const choose=(user,mode)=>{if(!['fast','general'].includes(mode))return;store(L+user,mode)};
const sessionToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fingerKey=(user,circle,date)=>STATUS+user+':'+circle+':'+date;
const pending=new Map();
const emit=(key,value)=>{store(key,value,sessionStorage);window.dispatchEvent(new CustomEvent('sanabil-fast-fingerprint',{detail:{key,value}}))};
const describe=val=>{
 switch(val?.state){
 case 'confirmed':return'تم تسجيل حضور المعلم لدى الخادم'+(val.lateMinutes>0?' · تأخر '+val.lateMinutes+' دقيقة':'')+'.';
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
    return update('failed',data?.error||error?.message||'رفض خادم البصمة الطلب');
   }
   return update('confirmed','سجل حضور مؤكد', {lateMinutes:Number(data?.lateMinutes||0),duplicate:!!data?.duplicate});
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
 const label=node('label','sl-fast-label','حلقة اليوم');
 const select=node('select');select.setAttribute('aria-label','اختر الحلقة التعليمية');label.append(select);
 const status=node('p','sl-fast-status','اختر الحلقة ثم اضغط بدء الجلسة.');
 status.setAttribute('role','status');
 const start=button('▶ بدء جلسة الحلقة',startCircle,'button-primary sl-fast-start');
 start.disabled=true;
 top.append(label,start,status);
 quick.append(heading,desc,top);
 root.append(modeBar,quick,general);
 let circles=[];
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
  if(circles.some(c=>c.id===saved))select.value=saved;
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
 const meta=node('div','sl-fast-session-meta');
 meta.append(identity,switcher);
 bar.append(meta,state,retry);
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
 const setMode=mode=>{
  choose(user,mode);
  const fast=mode==='fast';
  root.classList.toggle('sl-fast-session',fast);
  document.body.classList.toggle('sl-teacher-fast-running',fast);
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
 const result={update,setMode};
 root._sanabilFastOutcomes=result;
 return result;
}
function setQuickUp(root){
 if(!root||!document.body.classList.contains('sl-teacher-fast-running'))return;
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
 const save=button('إرسال الترشيحات المحددة',()=>form.requestSubmit(),'button-primary');
 save.type='submit';
 const cancel=button('إغلاق',()=>d.close(),'button-soft');cancel.type='button';
 form.append(save,cancel);
 d.append(title,note,names,form,result);
 document.body.append(d);
 d.addEventListener('close',()=>d.remove(),{once:true});
 d.showModal();
 try{
  if(typeof window.SanabilExamEnhanceForm!=='function')throw Error('تعذر تحميل اختيار مقرر الاختبار؛ أعد تحديث الصفحة.');
  await window.SanabilExamEnhanceForm(form);
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
window.SanabilTeacherFastPath={mountDashboard,mountOutcomes,consumeLaunch,fingerprint,bulkNominate,preferred,choose,describe,setQuickUp};
})();